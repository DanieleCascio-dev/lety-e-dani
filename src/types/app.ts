/**
 * Slug stabile in `app_user.app_role` (es. daniele, letizia o derivato dall’email).
 * Usato in DB per `created_by` / `added_by`; il nome in UI è `UserProfile.displayName` ↔ `app_user.display_name`.
 */
export type UserId = string

/** Forma del segnaposto colore (lista spesa, ecc.). */
export type IconShape =
  | 'circle'
  | 'square'
  | 'rounded'
  | 'diamond'
  | 'triangle'
  | 'star'

/** Classe CSS per il segnaposto visivo accanto al testo (es. cerchio colore profilo). */
export interface UserProfile {
  id: UserId
  /** Nome scelto dall’utente; in cloud ↔ `app_user.display_name`. */
  displayName: string
  textIcon: string
  /** Colore personalizzato (#RRGGBB); null = palette predefinita per ruolo. */
  iconColor: string | null
  iconShape: IconShape
  /** Sfondo navbar (#RRGGBB); null = tema predefinito (`bg-body`). */
  navbarBg: string | null
  /** Sfondo area contenuti (#RRGGBB); null = grigio chiaro app. */
  pageBg: string | null
  /** URL pubblico foto profilo (Supabase Storage); null = solo icona colore / default. */
  avatarUrl: string | null
}

/** Contenitore “lista della spesa”. */
export interface GroceryListMeta {
  id: string
  createdAt: string
  /** Slug `app_user.app_role` di chi ha creato la lista (non il nome visualizzato). */
  createdBy: UserId
  /** Nome mostrato prima della data; vuoto → solo “Lista del …”. */
  title: string
}

export interface GroceryItem {
  id: string
  text: string
  done: boolean
  /** Chi ha aggiunto l’articolo. */
  addedBy: UserId
  /** Presente in modalità locale multi-lista. */
  listId?: string
}

/** Contenitore todo (stessa forma della lista spesa). */
export type TodoListMeta = GroceryListMeta

/** Voce todo (stessa forma di un articolo spesa). */
export type TodoItem = GroceryItem
