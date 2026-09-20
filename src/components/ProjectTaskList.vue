<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { ElMessage, type InputInstance } from 'element-plus'
import type { Project, ProjectTask } from '../types'
import { useProjectStore } from '../stores/useProjectStore'
import { formatDate } from '../utils/format'

const props = defineProps<{ project: Project }>()

const projectStore = useProjectStore()

const tasks = computed<ProjectTask[]>(() => props.project.tasks ?? [])
const progress = computed(() => projectStore.taskProgress(props.project))
/** 已完成项目的清单归档为只读，仍可回看勾选状态与完成时间 */
const archived = computed(() => props.project.status === '已完成')
const allDone = computed(() => progress.value.total > 0 && progress.value.done === progress.value.total)

const newTitle = ref('')
const editingId = ref<string | null>(null)
const editingTitle = ref('')
const editInputRef = ref<InputInstance | null>(null)

function addTask() {
  const title = newTitle.value.trim()
  if (!title) return
  projectStore.addTask(props.project.id, title)
  newTitle.value = ''
}

function startEdit(task: ProjectTask) {
  editingId.value = task.id
  editingTitle.value = task.title
  nextTick(() => editInputRef.value?.focus())
}

function saveEdit(task: ProjectTask) {
  if (editingId.value !== task.id) return
  const title = editingTitle.value.trim()
  if (!title) {
    ElMessage.warning('子任务名称不能为空')
    return
  }
  projectStore.updateTask(props.project.id, task.id, title)
  editingId.value = null
}

function cancelEdit() {
  editingId.value = null
}

async function removeTask(task: ProjectTask) {
  projectStore.removeTask(props.project.id, task.id)
  if (editingId.value === task.id) editingId.value = null
}

function onToggle(task: ProjectTask, value: string | number | boolean) {
  projectStore.toggleTask(props.project.id, task.id, Boolean(value))
}
</script>

<template>
  <div class="task-list">
    <div class="task-summary">
      <el-progress
        :percentage="progress.percent"
        :status="allDone ? 'success' : undefined"
        style="flex: 1"
      />
      <span class="task-count" :class="{ done: allDone }">
        {{ progress.done }} / {{ progress.total }}
      </span>
    </div>

    <el-alert
      v-if="!archived && allDone"
      type="success"
      :closable="false"
      show-icon
      title="所有子任务已完成，别忘了在右上角把项目状态标记为「已完成」"
      class="task-alert"
    />
    <el-tag v-if="archived" type="info" effect="plain" class="task-alert">
      项目已完成，清单已归档，仅供回看
    </el-tag>

    <div v-if="tasks.length" class="task-items">
      <div v-for="task in tasks" :key="task.id" class="task-item" :class="{ 'is-done': task.done }">
        <el-checkbox
          :model-value="task.done"
          :disabled="archived"
          @change="(v: string | number | boolean) => onToggle(task, v)"
        />
        <template v-if="editingId === task.id">
          <el-input
            ref="editInputRef"
            v-model="editingTitle"
            size="small"
            class="task-edit-input"
            @keyup.enter="saveEdit(task)"
            @keyup.esc="cancelEdit"
            @blur="saveEdit(task)"
          />
        </template>
        <template v-else>
          <span class="task-title" @click="!archived && startEdit(task)">{{ task.title }}</span>
          <span v-if="task.done && task.completedAt" class="task-done-at">
            完成于 {{ formatDate(task.completedAt) }}
          </span>
        </template>
        <div v-if="!archived && editingId !== task.id" class="task-ops">
          <el-button size="small" text @click="startEdit(task)">
            <el-icon><Edit /></el-icon>
          </el-button>
          <el-button size="small" text type="danger" @click="removeTask(task)">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
      </div>
    </div>
    <el-empty v-else :description="archived ? '（该项目没有保留子任务清单）' : '还没有子任务，先拆几个步骤吧'" :image-size="50" />

    <div v-if="!archived" class="task-add">
      <el-input
        v-model="newTitle"
        placeholder="添加子任务，如：测量墙面尺寸"
        @keyup.enter="addTask"
      />
      <el-button type="primary" :disabled="!newTitle.trim()" @click="addTask">
        <el-icon><Plus /></el-icon>&nbsp;添加
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.task-summary {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 12px;
}
.task-count {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
}
.task-count.done {
  color: var(--success);
}
.task-alert {
  margin-bottom: 12px;
}
.task-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}
.task-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 6px;
}
.task-item:hover {
  background: var(--el-fill-color-light);
}
.task-item.is-done .task-title {
  color: var(--text-secondary);
  text-decoration: line-through;
}
.task-title {
  flex: 1;
  cursor: pointer;
  min-width: 0;
  word-break: break-all;
}
.task-edit-input {
  flex: 1;
}
.task-done-at {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}
.task-ops {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}
.task-item:hover .task-ops {
  opacity: 1;
}
.task-add {
  display: flex;
  gap: 10px;
}
</style>
