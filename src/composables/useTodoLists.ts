import { computed, ref, watch } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { GroceryItem, GroceryListMeta, TodoItem, UserId } from '@/types/app'
import { authSession } from '@/auth/authSession'
import { getSupabaseClient } from '@/lib/supabase'
import { queryAbortSignal } from '@/lib/supabaseQuery'
import {
  activeUser,
  appUserSessionValid,
  currentGarden,
  groceryListDisplayName,
  refreshGardenContext,
} from '@/composables/useAppStorage'

const SELECTED_TODO_LIST_KEY = 'lety-dani:selected-todo-list-id'

function readPersistedSelectedTodoListId(): string | null {
  try {
    return localStorage.getItem(SELECTED_TODO_LIST_KEY)
  } catch {
    return null
  }
}

function writePersistedSelectedTodoListId(id: string | null) {
  try {
    if (id) localStorage.setItem(SELECTED_TODO_LIST_KEY, id)
    else localStorage.removeItem(SELECTED_TODO_LIST_KEY)
  } catch {
    /* ignore */
  }
}

function normalizeListTitle(raw: string | undefined): string {
  return (raw ?? '').trim().slice(0, 80)
}

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function mapListRow(r: {
  id: string
  created_at: string
  created_by: string
  title?: string | null
}): GroceryListMeta {
  const by = String(r.created_by ?? '').trim()
  return {
    id: r.id,
    createdAt: r.created_at,
    createdBy: (by || 'daniele') as UserId,
    title: typeof r.title === 'string' ? r.title.trim() : '',
  }
}

function normalizeTodoItem(
  i: Partial<GroceryItem> & { id: string; text: string },
  fallbackBy: UserId,
): TodoItem {
  const raw = i.addedBy != null ? String(i.addedBy).trim() : ''
  const addedBy = (raw || fallbackBy) as UserId
  return {
    id: i.id,
    text: i.text,
    done: Boolean(i.done),
    addedBy,
  }
}

type TodoRow = {
  id: string
  text: string
  done: boolean
  added_by: string
  list_id: string
}

const todoLists = ref<GroceryListMeta[]>([])
const todoListsLoading = ref(false)
const selectedTodoListId = ref<string | null>(readPersistedSelectedTodoListId())
const todos = ref<TodoItem[]>([])
const todosLoading = ref(false)
const todosError = ref<string | null>(null)

let todoChannel: RealtimeChannel | null = null
let todoItemsRealtimeDebounceTimer: ReturnType<typeof setTimeout> | null = null
const TODO_ITEMS_REALTIME_DEBOUNCE_MS = 250

watch(selectedTodoListId, (id: string | null) => {
  writePersistedSelectedTodoListId(id)
})

function clearTodoItemsRealtimeDebounce() {
  if (todoItemsRealtimeDebounceTimer !== null) {
    clearTimeout(todoItemsRealtimeDebounceTimer)
    todoItemsRealtimeDebounceTimer = null
  }
}

function scheduleTodosRefetchFromRealtime() {
  clearTodoItemsRealtimeDebounce()
  todoItemsRealtimeDebounceTimer = setTimeout(() => {
    todoItemsRealtimeDebounceTimer = null
    void fetchTodosFromSupabase(true)
  }, TODO_ITEMS_REALTIME_DEBOUNCE_MS)
}

function teardownTodoRealtime() {
  clearTodoItemsRealtimeDebounce()
  const sb = getSupabaseClient()
  if (todoChannel && sb) void sb.removeChannel(todoChannel)
  todoChannel = null
}

async function fetchTodoListsFromSupabase(silent: boolean) {
  const sb = getSupabaseClient()
  if (!sb) return
  if (!silent) todoListsLoading.value = true
  try {
    const { data, error } = await sb
      .from('todo_lists')
      .select('id, created_at, created_by, title')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .abortSignal(queryAbortSignal())
    if (error) {
      todosError.value = error.message
      return
    }
    todoLists.value = (data ?? []).map((r: {
      id: string
      created_at: string
      created_by: string
      title?: string | null
    }) => mapListRow(r))
  } finally {
    if (!silent) todoListsLoading.value = false
  }
}

async function ensureSelectedTodoListAfterFetch() {
  const sid = selectedTodoListId.value
  if (sid && todoLists.value.some((l) => l.id === sid)) {
    writePersistedSelectedTodoListId(sid)
    return
  }
  const first = todoLists.value[0]?.id ?? null
  selectedTodoListId.value = first
}

async function fetchTodosFromSupabase(silent: boolean) {
  const sb = getSupabaseClient()
  if (!sb) return
  const lid = selectedTodoListId.value
  if (!lid) {
    if (!silent) todosLoading.value = false
    todos.value = []
    return
  }
  if (!silent) todosLoading.value = true
  try {
    const { data, error } = await sb
      .from('todo_items')
      .select('id, text, done, added_by, list_id')
      .eq('list_id', lid)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .abortSignal(queryAbortSignal())
    if (error) {
      todosError.value = error.message
      return
    }
    todosError.value = null
    const fallbackBy = activeUser.value
    todos.value = ((data ?? []) as TodoRow[]).map((r) =>
      normalizeTodoItem(
        {
          id: r.id,
          text: r.text,
          done: r.done,
          addedBy: r.added_by === 'letizia' || r.added_by === 'daniele' ? r.added_by : fallbackBy,
        },
        fallbackBy,
      ),
    )
  } finally {
    if (!silent) todosLoading.value = false
  }
}

function setupTodoRealtimeChannel() {
  const sb = getSupabaseClient()
  if (!sb || todoChannel) return
  const refresh = async () => {
    await fetchTodoListsFromSupabase(true)
    await ensureSelectedTodoListAfterFetch()
    await fetchTodosFromSupabase(true)
  }
  todoChannel = sb
    .channel('todo_scope')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'todo_lists' }, () => {
      void refresh()
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'todo_items' }, () => {
      scheduleTodosRefetchFromRealtime()
    })
    .subscribe()
}

async function startTodoSync() {
  const sb = getSupabaseClient()
  if (!sb) return
  teardownTodoRealtime()
  await fetchTodoListsFromSupabase(false)
  await ensureSelectedTodoListAfterFetch()
  await fetchTodosFromSupabase(false)
  queueMicrotask(() => setupTodoRealtimeChannel())
}

export function ensureTodoRealtimeConnected() {
  setupTodoRealtimeChannel()
}

export async function refreshTodoData(options?: { silent?: boolean; skipGarden?: boolean }) {
  const sb = getSupabaseClient()
  if (!sb || !authSession.value?.user) return
  const silent = options?.silent !== false
  if (!options?.skipGarden) {
    await refreshGardenContext()
  }
  await fetchTodoListsFromSupabase(silent)
  await ensureSelectedTodoListAfterFetch()
  await fetchTodosFromSupabase(silent)
}

/** Chiamare al logout (es. da App.vue) per evitare stato fantasma. */
export function resetTodoState() {
  teardownTodoRealtime()
  todoLists.value = []
  selectedTodoListId.value = null
  todos.value = []
  todosError.value = null
  todoListsLoading.value = false
  todosLoading.value = false
  try {
    localStorage.removeItem(SELECTED_TODO_LIST_KEY)
  } catch {
    /* ignore */
  }
}

export async function selectTodoList(id: string) {
  selectedTodoListId.value = id
  const sb = getSupabaseClient()
  if (sb) await fetchTodosFromSupabase(false)
}

export async function createTodoList(name?: string): Promise<boolean> {
  todosError.value = null
  const title = normalizeListTitle(name)
  const sb = getSupabaseClient()
  if (!sb) {
    todosError.value = 'Le todo richiedono Supabase e login.'
    return false
  }
  const gid = currentGarden.value?.id
  if (!gid) {
    todosError.value =
      'Nessuno spazio assegnato. Chiedi a un amministratore di aggiungerti a un garden.'
    return false
  }
  const { data, error } = await sb
    .from('todo_lists')
    .insert({ created_by: activeUser.value, title, garden_id: gid })
    .select('id, created_at, created_by, title')
    .single()
  if (error) {
    todosError.value = error.message
    return false
  }
  const meta = mapListRow(data as { id: string; created_at: string; created_by: string; title?: string | null })
  todoLists.value = [meta, ...todoLists.value]
  selectedTodoListId.value = meta.id
  todos.value = []
  return true
}

export async function renameTodoList(id: string, name: string): Promise<boolean> {
  todosError.value = null
  const title = normalizeListTitle(name)
  const sb = getSupabaseClient()
  if (!sb) return false
  const { error } = await sb
    .from('todo_lists')
    .update({ title })
    .eq('id', id)
    .is('deleted_at', null)
  if (error) {
    todosError.value = error.message
    return false
  }
  todoLists.value = todoLists.value.map((l) => (l.id === id ? { ...l, title } : l))
  return true
}

export async function deleteTodoList(id: string) {
  todosError.value = null
  const wasSelected = selectedTodoListId.value === id
  const sb = getSupabaseClient()
  if (!sb) return
  const now = new Date().toISOString()
  const { error: delItemsErr } = await sb
    .from('todo_items')
    .update({ deleted_at: now })
    .eq('list_id', id)
    .is('deleted_at', null)
  if (delItemsErr) {
    todosError.value = delItemsErr.message
    return
  }
  const { error } = await sb
    .from('todo_lists')
    .update({ deleted_at: now })
    .eq('id', id)
    .is('deleted_at', null)
  if (error) {
    todosError.value = error.message
    return
  }
  todoLists.value = todoLists.value.filter((l) => l.id !== id)
  if (wasSelected) {
    const nid = todoLists.value[0]?.id ?? null
    selectedTodoListId.value = nid
    await fetchTodosFromSupabase(false)
  }
}

export async function addTodoItem(text: string): Promise<boolean> {
  const t = text.trim()
  if (!t) return false
  const lid = selectedTodoListId.value
  if (!lid) {
    todosError.value = 'Crea o seleziona una lista prima.'
    return false
  }
  const id = newId()
  const item: TodoItem = { id, text: t, done: false, addedBy: activeUser.value }
  const sb = getSupabaseClient()
  if (!sb) {
    todosError.value = 'Supabase non configurato.'
    return false
  }
  const { error } = await sb.from('todo_items').insert({
    id,
    text: t,
    done: false,
    added_by: activeUser.value,
    list_id: lid,
  })
  if (error) {
    todosError.value = error.message
    return false
  }
  todosError.value = null
  todos.value.push(item)
  return true
}

export async function setTodoItemDone(id: string, done: boolean) {
  const item = todos.value.find((i) => i.id === id)
  if (!item) return
  const prev = item.done
  if (prev === done) return
  item.done = done
  const sb = getSupabaseClient()
  const lid = selectedTodoListId.value
  if (!sb || !lid) {
    item.done = prev
    return
  }
  const { error } = await sb
    .from('todo_items')
    .update({ done })
    .eq('id', id)
    .eq('list_id', lid)
    .is('deleted_at', null)
  if (error) {
    item.done = prev
    todosError.value = error.message
  } else {
    todosError.value = null
  }
}

export async function updateTodoItemText(id: string, text: string): Promise<boolean> {
  const t = text.trim()
  if (!t) return false
  const item = todos.value.find((i) => i.id === id)
  if (!item) return false
  const prevText = item.text
  if (prevText === t) {
    todosError.value = null
    return true
  }
  const sb = getSupabaseClient()
  const lid = selectedTodoListId.value
  if (!sb || !lid) return false
  item.text = t
  const { error } = await sb
    .from('todo_items')
    .update({ text: t })
    .eq('id', id)
    .eq('list_id', lid)
    .is('deleted_at', null)
  if (error) {
    item.text = prevText
    todosError.value = error.message
    return false
  }
  todosError.value = null
  return true
}

export async function removeTodoItem(id: string) {
  const sb = getSupabaseClient()
  const lid = selectedTodoListId.value
  if (!sb || !lid) return
  const prev = todos.value.slice()
  todos.value = todos.value.filter((x) => x.id !== id)
  const now = new Date().toISOString()
  const { error } = await sb
    .from('todo_items')
    .update({ deleted_at: now })
    .eq('id', id)
    .eq('list_id', lid)
    .is('deleted_at', null)
  if (error) {
    todos.value = prev
    todosError.value = error.message
  } else {
    todosError.value = null
  }
}

export async function clearDoneTodoItems() {
  const lid = selectedTodoListId.value
  if (!lid || !todos.value.length) return
  const sb = getSupabaseClient()
  if (!sb) return
  const prev = todos.value.slice()
  todos.value = todos.value.filter((i) => !i.done)
  const now = new Date().toISOString()
  const { error } = await sb
    .from('todo_items')
    .update({ deleted_at: now })
    .eq('list_id', lid)
    .eq('done', true)
    .is('deleted_at', null)
  if (error) {
    todos.value = prev
    todosError.value = error.message
  } else {
    todosError.value = null
  }
}

export async function markAllTodoItemsDone(done: boolean) {
  const lid = selectedTodoListId.value
  if (!lid || !todos.value.length) return
  const sb = getSupabaseClient()
  todos.value.forEach((i) => {
    i.done = done
  })
  if (!sb) return
  const { error } = await sb
    .from('todo_items')
    .update({ done })
    .eq('list_id', lid)
    .is('deleted_at', null)
  if (error) {
    todosError.value = error.message
    await fetchTodosFromSupabase(false)
  } else {
    todosError.value = null
  }
}

export function useTodoLists() {
  const currentTodoListMeta = computed(
    () => todoLists.value.find((l) => l.id === selectedTodoListId.value) ?? null,
  )

  const currentTodoList = computed(() => todos.value)

  const isTodoCloud = computed(() => getSupabaseClient() !== null)

  return {
    activeUser,
    appUserSessionValid,
    todoLists,
    todoListsLoading,
    selectedTodoListId,
    currentTodoListMeta,
    todosLoading,
    todosError,
    currentTodoList,
    isTodoCloud,
    todoListDisplayName: groceryListDisplayName,
    selectTodoList,
    createTodoList,
    renameTodoList,
    deleteTodoList,
    addTodoItem,
    setTodoItemDone,
    updateTodoItemText,
    removeTodoItem,
    clearDoneTodoItems,
    markAllTodoItemsDone,
    refreshTodoData,
    ensureTodoRealtimeConnected,
    startTodoSync,
  }
}
