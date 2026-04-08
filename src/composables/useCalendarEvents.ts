import { ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { CalendarEvent, UserId } from '@/types/app'
import { authSession } from '@/auth/authSession'
import { getSupabaseClient } from '@/lib/supabase'
import { queryAbortSignal } from '@/lib/supabaseQuery'
import {
  activeUser,
  currentGarden,
  refreshGardenContext,
} from '@/composables/useAppStorage'

type EventRow = {
  id: string
  title: string
  notes: string | null
  starts_at: string
  ends_at: string
  created_by: string
  assigned_to: string
  created_at: string
}

function mapRow(r: EventRow): CalendarEvent {
  return {
    id: r.id,
    title: r.title,
    notes: r.notes,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    createdBy: r.created_by as UserId,
    assignedTo: r.assigned_to as UserId,
    createdAt: r.created_at,
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const events = ref<CalendarEvent[]>([])
const eventsLoading = ref(false)
const eventsError = ref<string | null>(null)

let calendarChannel: RealtimeChannel | null = null
let realtimeDebounceTimer: ReturnType<typeof setTimeout> | null = null
const REALTIME_DEBOUNCE_MS = 300

let lastFetchStart: string | null = null
let lastFetchEnd: string | null = null

function clearRealtimeDebounce() {
  if (realtimeDebounceTimer !== null) {
    clearTimeout(realtimeDebounceTimer)
    realtimeDebounceTimer = null
  }
}

function scheduleRefetchFromRealtime() {
  clearRealtimeDebounce()
  realtimeDebounceTimer = setTimeout(() => {
    realtimeDebounceTimer = null
    if (lastFetchStart && lastFetchEnd) {
      void fetchEventsForRange(lastFetchStart, lastFetchEnd, true)
    }
  }, REALTIME_DEBOUNCE_MS)
}

function teardownCalendarRealtime() {
  clearRealtimeDebounce()
  const sb = getSupabaseClient()
  if (calendarChannel && sb) void sb.removeChannel(calendarChannel)
  calendarChannel = null
}

function setupCalendarRealtimeChannel() {
  const sb = getSupabaseClient()
  if (!sb || calendarChannel) return
  calendarChannel = sb
    .channel('calendar_scope')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => {
      scheduleRefetchFromRealtime()
    })
    .subscribe()
}

async function fetchEventsForRange(rangeStart: string, rangeEnd: string, silent: boolean) {
  const sb = getSupabaseClient()
  if (!sb) return
  lastFetchStart = rangeStart
  lastFetchEnd = rangeEnd
  if (!silent) eventsLoading.value = true
  try {
    const { data, error } = await sb
      .from('calendar_events')
      .select('id, title, notes, starts_at, ends_at, created_by, assigned_to, created_at')
      .lte('starts_at', rangeEnd)
      .gte('ends_at', rangeStart)
      .order('starts_at', { ascending: true })
      .abortSignal(queryAbortSignal())
    if (error) {
      eventsError.value = error.message
      return
    }
    eventsError.value = null
    events.value = ((data ?? []) as EventRow[]).map(mapRow)
  } finally {
    if (!silent) eventsLoading.value = false
  }
}

export async function refreshCalendarData(options?: { silent?: boolean; skipGarden?: boolean }) {
  const sb = getSupabaseClient()
  if (!sb || !authSession.value?.user) return
  const silent = options?.silent !== false
  if (!options?.skipGarden) {
    await refreshGardenContext()
  }
  if (lastFetchStart && lastFetchEnd) {
    await fetchEventsForRange(lastFetchStart, lastFetchEnd, silent)
  }
}

export function resetCalendarState() {
  teardownCalendarRealtime()
  events.value = []
  eventsError.value = null
  eventsLoading.value = false
  lastFetchStart = null
  lastFetchEnd = null
}

export async function addCalendarEvent(ev: {
  title: string
  notes: string | null
  startsAt: string
  endsAt: string
  assignedTo: UserId
}): Promise<boolean> {
  eventsError.value = null
  const sb = getSupabaseClient()
  if (!sb) {
    eventsError.value = 'Il calendario richiede Supabase e login.'
    return false
  }
  const gid = currentGarden.value?.id
  if (!gid) {
    eventsError.value =
      'Nessuno spazio assegnato. Chiedi a un amministratore di aggiungerti a un garden.'
    return false
  }
  const id = newId()
  const { data, error } = await sb
    .from('calendar_events')
    .insert({
      id,
      garden_id: gid,
      title: ev.title.trim(),
      notes: ev.notes?.trim() || null,
      starts_at: ev.startsAt,
      ends_at: ev.endsAt,
      created_by: activeUser.value,
      assigned_to: ev.assignedTo,
    })
    .select('id, title, notes, starts_at, ends_at, created_by, assigned_to, created_at')
    .single()
  if (error) {
    eventsError.value = error.message
    return false
  }
  const mapped = mapRow(data as EventRow)
  events.value = [...events.value, mapped].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  )
  return true
}

export async function updateCalendarEvent(
  id: string,
  patch: Partial<{ title: string; notes: string | null; startsAt: string; endsAt: string; assignedTo: UserId }>,
): Promise<boolean> {
  eventsError.value = null
  const sb = getSupabaseClient()
  if (!sb) return false
  const dbPatch: Record<string, unknown> = {}
  if (patch.title !== undefined) dbPatch.title = patch.title.trim()
  if (patch.notes !== undefined) dbPatch.notes = patch.notes?.trim() || null
  if (patch.startsAt !== undefined) dbPatch.starts_at = patch.startsAt
  if (patch.endsAt !== undefined) dbPatch.ends_at = patch.endsAt
  if (patch.assignedTo !== undefined) dbPatch.assigned_to = patch.assignedTo
  if (!Object.keys(dbPatch).length) return true
  const { error } = await sb.from('calendar_events').update(dbPatch).eq('id', id)
  if (error) {
    eventsError.value = error.message
    return false
  }
  events.value = events.value.map((e) => {
    if (e.id !== id) return e
    return {
      ...e,
      ...(patch.title !== undefined && { title: patch.title.trim() }),
      ...(patch.notes !== undefined && { notes: patch.notes?.trim() || null }),
      ...(patch.startsAt !== undefined && { startsAt: patch.startsAt }),
      ...(patch.endsAt !== undefined && { endsAt: patch.endsAt }),
      ...(patch.assignedTo !== undefined && { assignedTo: patch.assignedTo }),
    }
  })
  return true
}

export async function deleteCalendarEvent(id: string): Promise<boolean> {
  eventsError.value = null
  const sb = getSupabaseClient()
  if (!sb) return false
  const prev = events.value
  events.value = events.value.filter((e) => e.id !== id)
  const { error } = await sb.from('calendar_events').delete().eq('id', id)
  if (error) {
    events.value = prev
    eventsError.value = error.message
    return false
  }
  return true
}

export function useCalendarEvents() {
  return {
    events,
    eventsLoading,
    eventsError,
    fetchEventsForRange,
    addCalendarEvent,
    updateCalendarEvent,
    deleteCalendarEvent,
    refreshCalendarData,
    resetCalendarState,
    setupCalendarRealtimeChannel,
    teardownCalendarRealtime,
  }
}
