import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  MAX_NAME_LENGTH,
  presetLimitReason,
  samePresetValues,
  presetValuesFrom,
  validatePresetName,
  type Preset,
} from '../presets/presets';
import { WarnIcon } from './icons';
import type { Settings } from './model';

export interface PresetControls {
  presets: Preset[];
  /** The preset last applied or saved, or null. */
  activeId: string | null;
  /** False while stored presets are still arriving. */
  loaded: boolean;
  /** Applies the preset's values. Null clears the selection and leaves the values alone. */
  onSelect(id: string | null): void;
  /** Saves the current values under a name that has already been checked. */
  onSaveNew(name: string): void;
  onRename(id: string, name: string): void;
  onDelete(id: string): void;
  /** Saves the current values over the selected preset. */
  onUpdate(id: string): void;
}

interface PresetPickerProps extends PresetControls {
  settings: Settings;
  /** True while a field is invalid, so the current values can't be saved. */
  invalid: boolean;
}

type NameMode = { kind: 'new' } | { kind: 'rename'; id: string };

export function PresetPicker({
  presets,
  activeId,
  loaded,
  settings,
  invalid,
  onSelect,
  onSaveNew,
  onRename,
  onDelete,
  onUpdate,
}: PresetPickerProps) {
  const ids = useId();
  const [mode, setMode] = useState<NameMode | null>(null);
  const [name, setName] = useState('');
  const [attempted, setAttempted] = useState(false);

  const active = presets.find((p) => p.id === activeId) ?? null;
  const modified = active !== null && !samePresetValues(active.values, presetValuesFrom(settings));
  const limitReason = presetLimitReason(presets);
  const invalidReason = invalid ? 'Fix the highlighted fields first.' : null;
  const saveBlocked = !loaded || limitReason !== null || invalidReason !== null;
  const saveReason = limitReason ?? invalidReason;

  const nameError = mode
    ? validatePresetName(name, presets, mode.kind === 'rename' ? mode.id : undefined)
    : null;
  // An empty name is only reported once the user tries to save it.
  const shownError = nameError !== null && (attempted || name.trim() !== '') ? nameError : null;

  const open = (next: NameMode, initial: string) => {
    setMode(next);
    setName(initial);
    setAttempted(false);
  };
  const close = () => setMode(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!mode) return;
    if (nameError !== null) {
      setAttempted(true);
      return;
    }
    if (mode.kind === 'new') onSaveNew(name.trim());
    else onRename(mode.id, name.trim());
    close();
  };

  const onNameKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    // Escape cancels the name, not the whole panel.
    event.stopPropagation();
    close();
  };

  const selectId = `${ids}-select`;
  const nameId = `${ids}-name`;
  const nameErrorId = `${ids}-name-err`;
  const reasonId = `${ids}-reason`;

  return (
    <div className="field presets" data-slot="presets">
      <div className="lab">
        <label htmlFor={selectId}>Preset</label>
        {modified ? <span className="meta modified">Modified</span> : null}
      </div>
      <div className="join">
        <select
          id={selectId}
          name="preset"
          value={activeId ?? ''}
          disabled={!loaded}
          onChange={(event) => onSelect(event.target.value === '' ? null : event.target.value)}
        >
          <option value="">{presets.length === 0 ? 'No saved presets' : 'No preset'}</option>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
      </div>
      {mode ? (
        <form className="presetname" onSubmit={submit} noValidate>
          <label htmlFor={nameId}>{mode.kind === 'new' ? 'New preset name' : 'Preset name'}</label>
          <div className={shownError ? 'join bad' : 'join'}>
            <input
              id={nameId}
              type="text"
              name="presetName"
              autoComplete="off"
              autoFocus
              value={name}
              aria-invalid={shownError ? 'true' : 'false'}
              aria-describedby={shownError ? nameErrorId : undefined}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={onNameKeyDown}
            />
            <span className="suffix">
              {Array.from(name.trim()).length}/{MAX_NAME_LENGTH}
            </span>
          </div>
          {shownError ? (
            <p className="err" id={nameErrorId}>
              <WarnIcon />
              <span>{shownError}</span>
            </p>
          ) : null}
          <div className="presetrow two">
            <button type="submit" className="btn small primary">
              {mode.kind === 'new' ? 'Save preset' : 'Rename preset'}
            </button>
            <button type="button" className="btn small" onClick={close}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="presetrow">
            <button
              type="button"
              className="btn small"
              disabled={saveBlocked}
              aria-describedby={saveReason ? reasonId : undefined}
              title={saveReason ?? undefined}
              onClick={() => open({ kind: 'new' }, '')}
            >
              Save as new
            </button>
            <button
              type="button"
              className="btn small"
              disabled={!active}
              onClick={() => active && open({ kind: 'rename', id: active.id }, active.name)}
            >
              Rename
            </button>
            <button
              type="button"
              className="btn small danger"
              disabled={!active}
              onClick={() => active && onDelete(active.id)}
            >
              Delete
            </button>
          </div>
          {modified && active ? (
            <div className="presetmod">
              <p className="help">Changes to {active.name} are not saved.</p>
              <button
                type="button"
                className="btn small"
                disabled={invalid}
                onClick={() => onUpdate(active.id)}
              >
                Update preset
              </button>
            </div>
          ) : null}
          {saveReason ? (
            <p className="help" id={reasonId}>
              {saveReason}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
