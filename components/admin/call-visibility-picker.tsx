"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Choice = { id: string; name?: string | null; email?: string | null }

export type CallAccessValue = {
  inherit: boolean
  visibility_scope: "own" | "groups" | "selected" | "all"
  can_read_transcripts: boolean
  can_listen_recordings: boolean
  selected_user_ids: string[]
  selected_group_ids: string[]
}

export function CallVisibilityPicker({
  value,
  onChange,
  users = [],
  groups = [],
  allowInherit = true,
  inheritedLabel,
  disabled,
}: {
  value: CallAccessValue
  onChange: (value: CallAccessValue) => void
  users?: Choice[]
  groups?: Choice[]
  allowInherit?: boolean
  inheritedLabel?: string | null
  disabled?: boolean
}) {
  const set = (patch: Partial<CallAccessValue>) => onChange({ ...value, ...patch })
  const toggle = (key: "selected_user_ids" | "selected_group_ids", id: string, checked: boolean) => {
    const current = value[key]
    set({ [key]: checked ? [...new Set([...current, id])] : current.filter((x) => x !== id) } as Partial<CallAccessValue>)
  }

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold">Visibilità chiamate</h3>
        <p className="text-sm text-muted-foreground">
          Decide quali telefonate compaiono nel registro, nelle notifiche e nei conteggi per questo utente.
        </p>
      </div>

      {allowInherit && (
        <div className="mt-4 flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Eredita dai gruppi</p>
            <p className="text-xs text-muted-foreground">
              {inheritedLabel || "Se nessun gruppo imposta una regola, il default è Solo le mie."}
            </p>
          </div>
          <Switch checked={value.inherit} disabled={disabled} onCheckedChange={(inherit) => set({ inherit })} />
        </div>
      )}

      {!value.inherit && (
        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Può vedere</label>
            <Select
              value={value.visibility_scope}
              disabled={disabled}
              onValueChange={(visibility_scope: CallAccessValue["visibility_scope"]) => set({ visibility_scope })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="own">Solo le mie chiamate</SelectItem>
                <SelectItem value="groups">Le chiamate dei miei gruppi</SelectItem>
                <SelectItem value="selected">Utenti o gruppi selezionati</SelectItem>
                <SelectItem value="all">Tutte le chiamate del tenant</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {value.visibility_scope === "selected" && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border p-3">
                <p className="mb-2 text-sm font-medium">Utenti</p>
                <div className="max-h-52 space-y-2 overflow-auto">
                  {users.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={value.selected_user_ids.includes(u.id)}
                        disabled={disabled}
                        onCheckedChange={(checked) => toggle("selected_user_ids", u.id, checked === true)}
                      />
                      <span>{u.name || u.email || "Utente"}</span>
                    </label>
                  ))}
                  {users.length === 0 && <p className="text-xs text-muted-foreground">Nessun altro utente.</p>}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <p className="mb-2 text-sm font-medium">Gruppi</p>
                <div className="max-h-52 space-y-2 overflow-auto">
                  {groups.map((g) => (
                    <label key={g.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={value.selected_group_ids.includes(g.id)}
                        disabled={disabled}
                        onCheckedChange={(checked) => toggle("selected_group_ids", g.id, checked === true)}
                      />
                      <span>{g.name || "Gruppo"}</span>
                    </label>
                  ))}
                  {groups.length === 0 && <p className="text-xs text-muted-foreground">Nessun gruppo.</p>}
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Leggere trascrizioni</p>
                <p className="text-xs text-muted-foreground">Include riepilogo e sentiment.</p>
              </div>
              <Switch
                checked={value.can_read_transcripts}
                disabled={disabled}
                onCheckedChange={(can_read_transcripts) => set({ can_read_transcripts })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Ascoltare registrazioni</p>
                <p className="text-xs text-muted-foreground">Accesso al file audio della chiamata.</p>
              </div>
              <Switch
                checked={value.can_listen_recordings}
                disabled={disabled}
                onCheckedChange={(can_listen_recordings) => set({ can_listen_recordings })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
