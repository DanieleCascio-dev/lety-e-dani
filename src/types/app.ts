export type UserId = 'daniele' | 'letizia'

/** Classe CSS per il segnaposto visivo accanto al testo (es. cerchio colore profilo). */
export interface UserProfile {
  id: UserId
  displayName: string
  textIcon: string
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
