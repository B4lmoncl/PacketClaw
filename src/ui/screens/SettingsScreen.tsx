/**
 * Einstellungen: Sound, Reduced Motion, Scanlines, Sprache,
 * Savegame-Export/-Import (JSON-Datei) und Zurücksetzen.
 */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGame } from '../../game/store';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-panel border border-line bg-panel px-4 py-3">
      <span className="text-sm text-ink">{label}</span>
      {children}
    </div>
  );
}

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 rounded-full border transition-colors ${
        on ? 'border-trace bg-trace/30' : 'border-line bg-bg'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full transition-all ${
          on ? 'left-6 bg-trace' : 'left-0.5 bg-dim'
        }`}
      />
    </button>
  );
}

export function SettingsScreen() {
  const { t } = useTranslation();
  const settings = useGame((s) => s.settings);
  const updateSettings = useGame((s) => s.updateSettings);
  const exportSave = useGame((s) => s.exportSave);
  const importSave = useGame((s) => s.importSave);
  const fileInput = useRef<HTMLInputElement>(null);
  const [importState, setImportState] = useState<'idle' | 'ok' | 'error'>('idle');
  const [confirmReset, setConfirmReset] = useState(false);

  function doExport() {
    const blob = new Blob([exportSave()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aethergate-save-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function doImport(file: File) {
    void file.text().then((text) => {
      setImportState(importSave(text) ? 'ok' : 'error');
    });
  }

  function doReset() {
    localStorage.removeItem('packetclaw-save');
    window.location.reload();
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-2 px-3 pb-8 pt-4">
      <h1 className="mb-1 font-display text-xl font-bold">{t('settings.title')}</h1>

      <Row label={t('settings.sound')}>
        <Toggle
          on={settings.sound}
          onChange={(v) => updateSettings({ sound: v })}
          label={t('settings.sound')}
        />
      </Row>

      <Row label={t('settings.reducedMotion')}>
        <Toggle
          on={settings.motion === 'reduced'}
          onChange={(v) => updateSettings({ motion: v ? 'reduced' : 'system' })}
          label={t('settings.reducedMotion')}
        />
      </Row>

      <Row label={t('settings.scanlines')}>
        <Toggle
          on={settings.scanlines}
          onChange={(v) => updateSettings({ scanlines: v })}
          label={t('settings.scanlines')}
        />
      </Row>

      <Row label={t('settings.language')}>
        <select
          value={settings.locale}
          onChange={(e) => updateSettings({ locale: e.target.value as 'de' | 'en' })}
          className="rounded-row border border-line bg-bg px-2 py-1.5 font-mono text-xs text-ink"
          aria-label={t('settings.language')}
        >
          <option value="de">Deutsch</option>
          <option value="en">English</option>
        </select>
      </Row>

      <div className="mt-2 flex flex-col gap-2">
        <div className="font-mono text-[10px] uppercase tracking-widest text-dim">
          {t('settings.savegame')}
        </div>
        <div className="flex gap-2">
          <button
            onClick={doExport}
            className="flex-1 rounded-panel border border-trace/50 px-4 py-2.5 text-sm text-trace hover:bg-trace/10"
          >
            {t('settings.export')}
          </button>
          <button
            onClick={() => fileInput.current?.click()}
            className="flex-1 rounded-panel border border-line px-4 py-2.5 text-sm text-dim hover:text-ink"
          >
            {t('settings.import')}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) doImport(file);
              e.target.value = '';
            }}
          />
        </div>
        {importState === 'ok' && (
          <p className="text-sm text-trace" aria-live="polite">
            {t('settings.importOk')}
          </p>
        )}
        {importState === 'error' && (
          <p className="text-sm text-deny" aria-live="polite">
            {t('settings.importError')}
          </p>
        )}

        {confirmReset ? (
          <div className="flex items-center gap-2 rounded-panel border border-deny/60 bg-deny/5 px-4 py-2.5">
            <span className="flex-1 text-sm text-deny">{t('settings.resetConfirm')}</span>
            <button
              onClick={doReset}
              className="rounded-row bg-deny px-3 py-1.5 text-sm font-bold text-bg"
            >
              {t('settings.resetYes')}
            </button>
            <button
              onClick={() => setConfirmReset(false)}
              className="rounded-row border border-line px-3 py-1.5 text-sm text-dim"
            >
              {t('architect.cancel')}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmReset(true)}
            className="rounded-panel border border-deny/40 px-4 py-2.5 text-sm text-deny/80 hover:text-deny"
          >
            {t('settings.reset')}
          </button>
        )}
      </div>

      <p className="mt-4 text-center font-mono text-[10px] leading-relaxed text-dim">
        AetherGate · {t('settings.disclaimer')}
      </p>
    </div>
  );
}
