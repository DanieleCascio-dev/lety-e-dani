import { computed, ref, watch } from 'vue'
import type { GroceryItem, UserId, UserProfile } from '@/types/app'

const ACTIVE_USER_KEY = 'lety-dani:active-user'
const GROCERIES_KEY = 'lety-dani:groceries'
const PROFILES_KEY = 'lety-dani:user-profiles'

const DEFAULT_PROFILES: Record<UserId, UserProfile> = {
  daniele: {
    id: 'daniele',
    displayName: 'Daniele',
    textIcon: 'grocery-text-icon grocery-text-icon--daniele',
  },
  letizia: {
    id: 'letizia',
    displayName: 'Letizia',
    textIcon: 'grocery-text-icon grocery-text-icon--letizia',
  },
}

function loadProfiles(): Record<UserId, UserProfile> {
  const raw = sessionStorage.getItem(PROFILES_KEY)
  if (!raw) {
    sessionStorage.setItem(PROFILES_KEY, JSON.stringify(DEFAULT_PROFILES))
    return { ...DEFAULT_PROFILES }
  }
  try {
    const parsed = JSON.parse(raw) as Partial<Record<UserId, Partial<UserProfile>>>
    return {
      daniele: { ...DEFAULT_PROFILES.daniele, ...parsed.daniele, id: 'daniele' },
      letizia: { ...DEFAULT_PROFILES.letizia, ...parsed.letizia, id: 'letizia' },
    }
  } catch {
    return { ...DEFAULT_PROFILES }
  }
}

function normalizeGroceryItem(i: Partial<GroceryItem> & { id: string; text: string }, fallbackBy: UserId): GroceryItem {
  const addedBy = i.addedBy === 'letizia' || i.addedBy === 'daniele' ? i.addedBy : fallbackBy
  return {
    id: i.id,
    text: i.text,
    done: Boolean(i.done),
    addedBy,
  }
}

function parseGroceries(raw: string | null): GroceryItem[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return parsed.map((row) =>
        normalizeGroceryItem(row as Partial<GroceryItem> & { id: string; text: string }, 'daniele'),
      )
    }
    if (parsed && typeof parsed === 'object' && ('daniele' in parsed || 'letizia' in parsed)) {
      const o = parsed as Partial<Record<UserId, Partial<GroceryItem>[]>>
      const out: GroceryItem[] = []
      for (const uid of ['daniele', 'letizia'] as const) {
        const arr = o[uid]
        if (!Array.isArray(arr)) continue
        for (const row of arr) {
          if (row && typeof row === 'object' && 'id' in row && 'text' in row) {
            out.push(normalizeGroceryItem(row as Partial<GroceryItem> & { id: string; text: string }, uid))
          }
        }
      }
      return out
    }
  } catch {
    /* ignore */
  }
  return []
}

const activeUser = ref<UserId>('daniele')
const groceries = ref<GroceryItem[]>([])
const userProfiles = ref<Record<UserId, UserProfile>>(loadProfiles())

function loadFromSession() {
  const u = sessionStorage.getItem(ACTIVE_USER_KEY)
  if (u === 'daniele' || u === 'letizia') {
    activeUser.value = u
  }
  groceries.value = parseGroceries(sessionStorage.getItem(GROCERIES_KEY))
}

loadFromSession()

watch(
  [activeUser, groceries],
  () => {
    sessionStorage.setItem(ACTIVE_USER_KEY, activeUser.value)
    sessionStorage.setItem(GROCERIES_KEY, JSON.stringify(groceries.value))
  },
  { deep: true },
)

watch(
  userProfiles,
  (p) => {
    sessionStorage.setItem(PROFILES_KEY, JSON.stringify(p))
  },
  { deep: true },
)

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function useAppStorage() {
  const currentList = computed(() => groceries.value)

  function setActiveUser(id: UserId) {
    activeUser.value = id
  }

  function profileFor(userId: UserId): UserProfile {
    return userProfiles.value[userId]
  }

  function textIconClassFor(userId: UserId): string {
    return userProfiles.value[userId].textIcon
  }

  function addGroceryItem(text: string) {
    const t = text.trim()
    if (!t) return
    groceries.value.push({
      id: newId(),
      text: t,
      done: false,
      addedBy: activeUser.value,
    })
  }

  function toggleGroceryItem(id: string) {
    const item = groceries.value.find((i) => i.id === id)
    if (item) item.done = !item.done
  }

  function removeGroceryItem(id: string) {
    const i = groceries.value.findIndex((x) => x.id === id)
    if (i !== -1) groceries.value.splice(i, 1)
  }

  function clearDoneGroceryItems() {
    groceries.value = groceries.value.filter((i) => !i.done)
  }

  return {
    activeUser,
    setActiveUser,
    userProfiles,
    profileFor,
    textIconClassFor,
    currentList,
    addGroceryItem,
    toggleGroceryItem,
    removeGroceryItem,
    clearDoneGroceryItems,
  }
}
