// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef } from 'react';
import { Icon } from './icons.tsx';

const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Strg';

const KEYS: [string, string][] = [
  [`${MOD} + S`, 'Speichern (in die geöffnete Datei)'],
  [`${MOD} + Umschalt + S`, 'Speichern unter'],
  [`${MOD} + O`, 'Öffnen'],
  [`${MOD} + Z`, 'Rückgängig'],
  [`${MOD} + Y`, 'Wiederholen'],
  [`${MOD} + D`, 'Duplizieren'],
  [`${MOD} + G`, 'Gruppieren'],
  [`${MOD} + A`, 'Alles auswählen'],
  ['R', 'Drehen (90°)'],
  ['F', 'Spiegeln'],
  ['Entf', 'Löschen'],
  ['Pfeiltasten', 'Verschieben um ein Rasterfeld (mit Umschalt: vier)'],
  ['Umschalt + Klick', 'Auswahl erweitern'],
  ['Ziehen auf leerem Blatt', 'Rahmenauswahl'],
  ['Ziehen von Anschluss zu Anschluss', 'Verbinden'],
  ['Symbol auf Leitung ziehen', 'In Leitung einsetzen'],
  ['Leitungsabschnitt ziehen', 'Leitung verlegen'],
  ['Mausrad', 'Zoom'],
  ['Leertaste + Ziehen, mittlere Maustaste', 'Ansicht verschieben'],
  ['0', 'Blatt einpassen'],
  ['N', 'Anmerkung setzen: Klick auf Symbol, Leitung oder freie Stelle'],
  ['Esc', 'Werkzeug beenden, Auswahl aufheben'],
];

export function Help({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="help"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
    >
      <header>
        <h2>Tastaturkürzel</h2>
        <button className="tb" onClick={() => ref.current?.close()} aria-label="Schliessen">
          <Icon name="close" />
        </button>
      </header>
      <table>
        <tbody>
          {KEYS.map(([k, v]) => (
            <tr key={k}>
              <th>
                <kbd>{k}</kbd>
              </th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </dialog>
  );
}
