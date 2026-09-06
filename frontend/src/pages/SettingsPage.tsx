import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { errorMessage, useCategories, useContacts, useCreateCategory, useCreateContact, useDeleteCategory, useDeleteContact, useMe, useUpdateCategory, useUpdateMe } from '../lib/queries'
import type { Category, CategoryType, Contact } from '../lib/types'
import { ThemeToggle } from '../components/ThemeToggle'
import { useTheme } from '../theme/ThemeContext'
import {
  Badge,
  Card,
  Field,
  Modal,
  PageHeader,
  SectionTitle,
  Spinner,
  cx,
  inputClass,
  primaryButtonClass,
} from '../components/ui'

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />
      <AppearanceCard />
      <ProfileCard />
      <CategoriesCard />
      <ContactsCard />
    </div>
  )
}

function AppearanceCard() {
  const { theme } = useTheme()
  return (
    <Card>
      <SectionTitle>Appearance</SectionTitle>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Theme</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Follows your system setting until you pick a side.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs capitalize text-slate-500 dark:text-slate-400">{theme}</span>
          <ThemeToggle />
        </div>
      </div>
    </Card>
  )
}

function ProfileCard() {
  const { data: profile, isLoading } = useMe()
  const updateMe = useUpdateMe()
  const [name, setName] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  if (isLoading || !profile) return <Spinner />

  async function save(event: React.FormEvent) {
    event.preventDefault()
    await updateMe.mutateAsync({ fullName: name ?? profile?.fullName ?? '' })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Card>
      <SectionTitle>Profile</SectionTitle>
      <form onSubmit={save} className="flex flex-wrap items-end gap-3">
        <div className="w-72">
          <Field label="Display name">
            <input
              maxLength={120}
              value={name ?? profile.fullName ?? ''}
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
              placeholder="Your name"
            />
          </Field>
        </div>
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Currency</span>
          <Badge tone="gray">INR only in v1</Badge>
        </div>
        <button type="submit" disabled={updateMe.isPending} className={primaryButtonClass}>
          {updateMe.isPending ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-sm text-income">Saved ✓</span>}
      </form>
      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">user: {profile.id}</p>
    </Card>
  )
}

function CategoriesCard() {
  const { data: categories = [], isLoading } = useCategories(true)
  const createCategory = useCreateCategory()
  const updateCategory = useUpdateCategory()
  const deleteCategory = useDeleteCategory()

  const [name, setName] = useState('')
  const [type, setType] = useState<CategoryType>('EXPENSE')
  const [parentId, setParentId] = useState('')
  const [editing, setEditing] = useState<Category | null>(null)
  const [editName, setEditName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const queryClient = useQueryClient()

  function refresh() {
    void queryClient.invalidateQueries()
  }

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      await createCategory.mutateAsync({
        name,
        categoryType: type,
        parentCategoryId: parentId || null,
      })
      setName('')
      setParentId('')
      refresh()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const parents = categories.filter((category) => category.isActive && category.parentCategoryId === null && category.categoryType === type)

  function renderCategory(category: Category, child?: Category) {
    return (
      <li key={(child ?? category).id} className={cx('flex items-center justify-between gap-2 py-2 text-sm', child && 'pl-6 text-slate-600 dark:text-slate-400')}>
        <span className="flex min-w-0 items-center gap-2">
          {child ? <span className="text-slate-300 dark:text-slate-600">└</span> : <span className="font-medium text-slate-800 dark:text-slate-100">{category.name}</span>}
          <span className="truncate">{child?.name}</span>
          {!(child ?? category).isActive && <Badge tone="gray">inactive</Badge>}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setEditing(child ?? category)
              setEditName((child ?? category).name)
            }}
            className="text-xs text-slate-500 hover:underline dark:text-slate-400"
          >
            rename
          </button>
          <button
            type="button"
            onClick={() => void deleteCategory.mutateAsync((child ?? category).id).then(refresh).catch((err) => alert(errorMessage(err)))}
            className="text-xs text-rose-500 hover:underline dark:text-rose-400"
          >
            delete
          </button>
        </span>
      </li>
    )
  }

  const incomeRoots = categories.filter((category) => category.categoryType === 'INCOME' && category.parentCategoryId === null)
  const expenseRoots = categories.filter((category) => category.categoryType === 'EXPENSE' && category.parentCategoryId === null)

  return (
    <Card>
      <SectionTitle>Categories</SectionTitle>
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Income</div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">{incomeRoots.map((root) => (
              <div key={root.id}>
                {renderCategory(root)}
                {categories.filter((child) => child.parentCategoryId === root.id).map((child) => renderCategory(root, child))}
              </div>
            ))}</ul>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Expense</div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">{expenseRoots.map((root) => (
              <div key={root.id}>
                {renderCategory(root)}
                {categories.filter((child) => child.parentCategoryId === root.id).map((child) => renderCategory(root, child))}
              </div>
            ))}</ul>
          </div>
        </div>
      )}

      <form onSubmit={create} className="mt-5 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
        <div className="w-48">
          <Field label="New category">
            <input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder="Name" />
          </Field>
        </div>
        <div className="w-32">
          <Field label="Type">
            <select value={type} onChange={(event) => setType(event.target.value as CategoryType)} className={inputClass}>
              <option value="EXPENSE">Expense</option>
              <option value="INCOME">Income</option>
            </select>
          </Field>
        </div>
        <div className="w-48">
          <Field label="Parent (optional)">
            <select value={parentId} onChange={(event) => setParentId(event.target.value)} className={inputClass}>
              <option value="">Top level</option>
              {parents.map((parent) => (
                <option key={parent.id} value={parent.id}>{parent.name}</option>
              ))}
            </select>
          </Field>
        </div>
        <button type="submit" disabled={createCategory.isPending} className={primaryButtonClass}>Add</button>
        {error && <p className="w-full rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">{error}</p>}
      </form>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Rename category">
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            if (!editing) return
            try {
              await updateCategory.mutateAsync({ id: editing.id, body: { name: editName } })
              setEditing(null)
              refresh()
            } catch (err) {
              alert(errorMessage(err))
            }
          }}
          className="space-y-4"
        >
          <Field label="Name">
            <input required maxLength={120} value={editName} onChange={(event) => setEditName(event.target.value)} className={inputClass} />
          </Field>
          <div className="flex justify-end">
            <button type="submit" className={primaryButtonClass}>Save</button>
          </div>
        </form>
      </Modal>
    </Card>
  )
}

function ContactsCard() {
  const { data: contacts = [], isLoading } = useContacts()
  const createContact = useCreateContact()
  const deleteContact = useDeleteContact()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      await createContact.mutateAsync({ name })
      setName('')
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function remove(contact: Contact) {
    try {
      // §22 — contacts with loans are blocked (409) and the message surfaces
      await deleteContact.mutateAsync(contact.id)
    } catch (err) {
      alert(errorMessage(err))
    }
  }

  return (
    <Card>
      <SectionTitle>Contacts</SectionTitle>
      {isLoading ? (
        <Spinner />
      ) : contacts.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No contacts yet — add one when you record a loan.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {contacts.map((contact) => (
            <li key={contact.id} className="flex items-center justify-between py-2 text-sm">
              <span className="font-medium text-slate-800 dark:text-slate-100">{contact.name}</span>
              <button type="button" onClick={() => void remove(contact)} className="text-xs text-rose-500 hover:underline dark:text-rose-400">
                delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={create} className="mt-4 flex items-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
        <div className="w-56">
          <Field label="New contact">
            <input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder="Name" />
          </Field>
        </div>
        <button type="submit" disabled={createContact.isPending} className={primaryButtonClass}>Add</button>
        {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      </form>
    </Card>
  )
}
