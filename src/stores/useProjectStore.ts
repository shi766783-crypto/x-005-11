import { computed } from 'vue'
import {
  DIFFICULTY_WEIGHT,
  type Project,
  type ProjectGap,
  type ProjectTask,
  type TaskProgress,
  type ToolGap,
  type MaterialGap,
  type Tool,
  type ProjectToolItem,
  type ProjectMaterialItem,
} from '../types'
import { useLocalStorage } from '../utils/storage'
import { uid } from '../utils/id'
import { toNumber, isCurrentMonth } from '../utils/format'
import { useToolStore } from './useToolStore'
import { useMaterialStore } from './useMaterialStore'
import { useBorrowStore } from './useBorrowStore'

// 模块级单例状态
const projects = useLocalStorage<Project[]>('diy.projects', [])

/**
 * 计算单个工具当前可投入项目的可用数量：
 * 仅「完好」状态可用的工具才计入，且需扣除当前被借出的数量。
 */
function toolAvailable(tool: Tool, borrowedByTool: Record<string, number>): number {
  if (tool.status !== '完好') return 0
  const borrowed = borrowedByTool[tool.id] ?? 0
  return Math.max(0, toNumber(tool.quantity) - borrowed)
}

export function useProjectStore() {
  const toolStore = useToolStore()
  const materialStore = useMaterialStore()
  const borrowStore = useBorrowStore()

  function addProject(data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Project {
    const now = Date.now()
    const project: Project = { ...data, id: uid('proj_'), createdAt: now, updatedAt: now }
    projects.value.push(project)
    return project
  }

  function updateProject(id: string, patch: Partial<Omit<Project, 'id' | 'createdAt'>>) {
    const project = projects.value.find((p) => p.id === id)
    if (project) {
      Object.assign(project, patch, { updatedAt: Date.now() })
      // 状态变为已完成时记录完成时间，供「本月完成项目数」统计
      if (patch.status === '已完成' && !project.completedAt) {
        project.completedAt = Date.now()
      }
      if (patch.status && patch.status !== '已完成') {
        project.completedAt = undefined
      }
    }
  }

  function removeProject(id: string) {
    projects.value = projects.value.filter((p) => p.id !== id)
  }

  function getProject(id: string): Project | undefined {
    return projects.value.find((p) => p.id === id)
  }

  /** 子任务清单整体进度：已勾选数 / 总数（百分比），无子任务时为 0 */
  function taskProgress(project: Project): TaskProgress {
    const tasks = project.tasks ?? []
    const total = tasks.length
    const done = tasks.filter((t) => t.done).length
    return { total, done, percent: total === 0 ? 0 : Math.round((done / total) * 100) }
  }

  /** 新增子任务，返回新任务 */
  function addTask(projectId: string, title: string): ProjectTask | undefined {
    const project = getProject(projectId)
    if (!project) return undefined
    if (!project.tasks) project.tasks = []
    const task: ProjectTask = { id: uid('task_'), title: title.trim(), done: false, createdAt: Date.now() }
    project.tasks.push(task)
    touch(project)
    return task
  }

  /** 修改子任务标题 */
  function updateTask(projectId: string, taskId: string, title: string) {
    const project = getProject(projectId)
    const task = project?.tasks?.find((t) => t.id === taskId)
    if (!project || !task) return
    const trimmed = title.trim()
    if (!trimmed || trimmed === task.title) return
    task.title = trimmed
    touch(project)
  }

  /** 勾选 / 取消勾选子任务，同步记录或清空完成时间 */
  function toggleTask(projectId: string, taskId: string, done?: boolean) {
    const project = getProject(projectId)
    const task = project?.tasks?.find((t) => t.id === taskId)
    if (!project || !task) return
    task.done = done ?? !task.done
    task.completedAt = task.done ? Date.now() : undefined
    touch(project)
  }

  /** 删除子任务 */
  function removeTask(projectId: string, taskId: string) {
    const project = getProject(projectId)
    if (!project?.tasks) return
    project.tasks = project.tasks.filter((t) => t.id !== taskId)
    touch(project)
  }

  /** 更新 updatedAt（持久化由 storage 的深度 watch 负责） */
  function touch(project: Project) {
    project.updatedAt = Date.now()
  }

  /** 项目缺口分析（核心计算属性逻辑）：对比库存，生成待采购/待借用清单 */
  function computeGap(project: Project): ProjectGap {
    const toolGaps: ToolGap[] = project.tools
      .map((item: ProjectToolItem) => {
        let available = 0
        if (item.source === 'library' && item.toolId) {
          const tool = toolStore.getTool(item.toolId)
          if (tool) available = toolAvailable(tool, borrowStore.borrowedByTool.value)
        }
        const required = toNumber(item.requiredQty)
        return {
          key: item.key,
          name: item.name,
          requiredQty: required,
          availableQty: available,
          missingQty: Math.max(0, required - available),
          source: item.source,
        }
      })
      .filter((g) => g.missingQty > 0)

    const materialGaps: MaterialGap[] = project.materials
      .map((item: ProjectMaterialItem) => {
        let available = 0
        if (item.source === 'library' && item.materialId) {
          const material = materialStore.getMaterial(item.materialId)
          if (material) available = toNumber(material.quantity)
        }
        const required = toNumber(item.requiredQty)
        return {
          key: item.key,
          name: item.name,
          requiredQty: required,
          availableQty: available,
          missingQty: Math.max(0, required - available),
          unit: item.unit,
          source: item.source,
        }
      })
      .filter((g) => g.missingQty > 0)

    return { tools: toolGaps, materials: materialGaps, hasGap: toolGaps.length > 0 || materialGaps.length > 0 }
  }

  /** 已完成项目 */
  const completedProjects = computed(() => projects.value.filter((p) => p.status === '已完成'))

  /** 进行中项目 */
  const inProgressProjects = computed(() => projects.value.filter((p) => p.status === '进行中'))

  /** 本月完成项目数 */
  const completedThisMonth = computed(() =>
    completedProjects.value.filter((p) => p.completedAt && isCurrentMonth(p.completedAt)).length,
  )

  /** DIY 达人分：已完成项目按难度加权求和 */
  const diyScore = computed(() =>
    completedProjects.value.reduce((s, p) => s + DIFFICULTY_WEIGHT[p.difficulty], 0),
  )

  return {
    projects,
    addProject,
    updateProject,
    removeProject,
    getProject,
    computeGap,
    taskProgress,
    addTask,
    updateTask,
    toggleTask,
    removeTask,
    completedProjects,
    inProgressProjects,
    completedThisMonth,
    diyScore,
  }
}
