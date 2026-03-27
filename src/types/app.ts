export type UserId = 'daniele' | 'letizia'

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
  displayName: string
  textIcon: string
  /** Colore personalizzato (#RRGGBB); null = palette predefinita per ruolo. */
  iconColor: string | null
  iconShape: IconShape
}

/** Contenitore “lista della spesa”. */
export interface GroceryListMeta {
  id: string
  createdAt: string
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
