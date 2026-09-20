<script setup lang="ts">
import { ref, computed, nextTick, useTemplateRef } from 'vue'
import { ElMessage } from 'element-plus'
import type { Project } from '../types'
import { useProjectStore } from '../stores/useProjectStore'

const props = defineProps<{ project: Project }>()

const projectStore = useProjectStore()

const tasks = computed(() => props.project.tasks ?? [])
const progress = computed(() => projectStore.taskProgress(props.project))
const readonly = computed(() => props.project.status === '已完成')

const newTitle = ref('')
const newInputRef = useTemplateRef<HTMLInputElement>('newInputRef')

const editingId = ref<string | null>(null)
const editingTitle = ref('')
const editInputRef = useTemplateRef<HTMLInputElement>('editInputRef')

function addTask() {
  const title = newTitle.value.trim()
  if (!title) return
  projectStore.addTask(props.project.id, title)
  newTitle.value = ''
  nextTick(() => newInputRef.value?.focus())
}

function toggleDone(id: string, done: boolean) {
  projectStore.updateTask(props.project.id, id, { done })
}

async function removeTask(id: string) {
  projectStore.removeTask(props.project.id, id)
  ElMessage.success('子任务已删除')
}

function startEdit(id: string, title: string) {
  editingId.value = id
  editingTitle.value = title
  nextTick(() => editInputRef.value?.focus())
}

function saveEdit() {
  if (!editingId.value) return
  const title = editingTitle.value.trim()
  if (!title) {
    cancelEdit()
    return
  }
  projectStore.updateTask(props.project.id, editingId.value, { title })
  editingId.value = null
}

function cancelEdit() {
  editingId.value = null
  editingTitle.value = ''
}

/** 进度条状态：全部完成显示成功色，否则主色 */
const progressStatus = computed<'success' | ''>(() => (progress.value.allDone ? 'success' : ''))
</script>

<template>
  <div class="task-checklist">
    <div class="checklist-head">
      <span class="head-title">
        子任务清单
        <el-tag size="small" :type="progress.allDone ? 'success' : 'info'" class="count-tag">
          {{ progress.done }}/{{ progress.total }}
        </el-tag>
      </span>
      <span v-if="progress.total > 0" class="muted">{{ progress.percent }}%</span>
    </div>

    <el-progress
      v-if="progress.total > 0"
      :percentage="progress.percent"
      :status="progressStatus || undefined"
      :stroke-width="10"
      class="progress"
    />

    <el-alert
      v-if="readonly"
      title="项目已完成，清单保留供回看（不可再修改）"
      type="success"
      :closable="false"
      show-icon
      class="done-tip"
    />

    <ul v-if="tasks.length" class="task-list">
      <li v-for="task in tasks" :key="task.id" class="task-item" :class="{ 'is-done': task.done }">
        <el-checkbox
          :model-value="task.done"
          :disabled="readonly"
          @change="(v: boolean | string | number) => toggleDone(task.id, Boolean(v))"
        />
        <template v-if="editingId === task.id">
          <el-input
            ref="editInputRef"
            v-model="editingTitle"
            size="small"
            class="edit-input"
            @keyup.enter="saveEdit"
            @keyup.esc="cancelEdit"
            @blur="saveEdit"
          />
        </template>
        <template v-else>
          <span class="task-title" @click="!readonly && startEdit(task.id, task.title)">{{ task.title }}</span>
          <div v-if="!readonly" class="task-actions">
            <el-button size="small" text @click="startEdit(task.id, task.title)">
              <el-icon><Edit /></el-icon>
            </el-button>
            <el-popconfirm title="删除该子任务？" confirm-button-text="删除" cancel-button-text="取消" @confirm="removeTask(task.id)">
              <template #reference>
                <el-button size="small" type="danger" text>
                  <el-icon><Delete /></el-icon>
                </el-button>
              </template>
            </el-popconfirm>
          </div>
        </template>
      </li>
    </ul>
    <el-empty v-else :description="readonly ? '（无清单记录）' : '还没有子任务，添加后逐项勾选，避免漏项'" :image-size="56" />

    <div v-if="!readonly" class="add-row">
      <el-input
        ref="newInputRef"
        v-model="newTitle"
        size="small"
        placeholder="添加子任务，如：测量尺寸、采购木料"
        @keyup.enter="addTask"
      />
      <el-button size="small" type="primary" :disabled="!newTitle.trim()" @click="addTask">
        <el-icon><Plus /></el-icon>&nbsp;添加
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.checklist-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.head-title {
  font-weight: 600;
  font-size: 15px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.count-tag {
  font-weight: 400;
}
.progress {
  margin-bottom: 12px;
}
.done-tip {
  margin-bottom: 12px;
}
.task-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.task-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border-bottom: 1px solid var(--border);
}
.task-item:last-child {
  border-bottom: none;
}
.task-title {
  flex: 1;
  cursor: pointer;
  word-break: break-all;
}
.task-item.is-done .task-title {
  color: var(--text-secondary);
  text-decoration: line-through;
}
.task-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}
.task-item:hover .task-actions {
  opacity: 1;
}
.edit-input {
  flex: 1;
}
.add-row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
</style>
