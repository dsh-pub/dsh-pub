export const styles = String.raw`
.dshpub-directory {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: 32px 32px 40px;
  color: var(--dsw-alias-label-primary);
  container: dshpub / inline-size;
  font-family: inherit;
}

.dshpub-directory *, .dshpub-directory *::before, .dshpub-directory *::after {
  box-sizing: border-box;
}

.dshpub-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 24px;
  align-items: end;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}

.dshpub-eyebrow, .dshpub-meta, .dshpub-result-meta, .dshpub-safe-note {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.dshpub-eyebrow {
  margin: 0 0 8px;
  font-weight: 650;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.dshpub-title {
  margin: 0;
  max-width: 720px;
  font-size: clamp(26px, 4vw, 42px);
  line-height: 1.05;
  letter-spacing: -.035em;
}

.dshpub-summary {
  max-width: 660px;
  margin: 12px 0 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 14px;
  line-height: 1.65;
}

.dshpub-snapshot {
  min-width: 148px;
  padding-left: 18px;
  border-left: 2px solid var(--dsw-alias-brand-primary);
}

.dshpub-snapshot strong {
  display: block;
  font-size: 32px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.dshpub-snapshot span {
  display: block;
  margin-top: 6px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 1.45;
}

.dshpub-bus-section {
  padding: 26px 0 24px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}

.dshpub-section-heading {
  display: flex;
  gap: 16px;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 16px;
}

.dshpub-section-heading h3 {
  margin: 0;
  font-size: 15px;
  letter-spacing: -.01em;
}

.dshpub-section-heading p {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}

.dshpub-clear-topic {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.dshpub-capability-bus {
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.dshpub-capability-bus::before {
  position: absolute;
  top: 23px;
  right: 6%;
  left: 6%;
  height: 1px;
  background: var(--dsw-alias-border-l2);
  content: '';
}

.dshpub-topic {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  gap: 9px;
  align-items: center;
  min-height: 48px;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-secondary);
  text-align: left;
  cursor: pointer;
  transition: border-color 140ms ease, background 140ms ease, transform 140ms ease;
}

.dshpub-topic:hover {
  border-color: var(--dsw-alias-label-dimmed);
  background: var(--dsw-alias-interactive-bg-hover);
}

.dshpub-topic[aria-pressed='true'] {
  border-color: var(--dsw-alias-brand-primary);
  background: var(--dsw-specific-sidebar-nav-item-active);
  color: var(--dsw-alias-label-primary);
  transform: translateY(-2px);
}

.dshpub-topic-code {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 6px;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: -.03em;
}

.dshpub-topic-label {
  overflow: hidden;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dshpub-topic-count {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.dshpub-controls {
  display: grid;
  grid-template-columns: minmax(240px, 2fr) repeat(5, minmax(112px, 1fr));
  gap: 10px;
  padding: 20px 0 16px;
}

.dshpub-field {
  min-width: 0;
}

.dshpub-field label {
  display: block;
  margin: 0 0 5px 2px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
  font-weight: 650;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.dshpub-field input, .dshpub-field select {
  width: 100%;
  height: 38px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 7px;
  outline: none;
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
}

.dshpub-field input {
  padding: 0 12px;
}

.dshpub-field select {
  padding: 0 8px;
}

.dshpub-field input::placeholder {
  color: var(--dsw-alias-label-tertiary);
}

.dshpub-field input:focus, .dshpub-field select:focus {
  border-color: var(--dsw-alias-brand-primary);
}

.dshpub-results-head {
  display: flex;
  min-height: 34px;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
}

.dshpub-results-head strong {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.dshpub-reset {
  border: 0;
  padding: 5px 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.dshpub-list {
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--dsw-alias-border-l2);
  list-style: none;
}

.dshpub-entry {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: center;
  padding: 16px 4px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}

.dshpub-entry-main {
  min-width: 0;
}

.dshpub-entry-title-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.dshpub-entry-link {
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 650;
  line-height: 1.35;
  text-decoration: none;
}

.dshpub-entry-link:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.dshpub-entry-description {
  display: -webkit-box;
  overflow: hidden;
  margin: 6px 0 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1.55;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.dshpub-entry-meta, .dshpub-entry-side {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.dshpub-entry-side {
  max-width: 176px;
  justify-content: flex-end;
}

.dshpub-badge {
  display: inline-flex;
  min-height: 21px;
  align-items: center;
  padding: 2px 7px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
  line-height: 1.2;
}

.dshpub-badge-strong {
  border-color: var(--dsw-alias-label-dimmed);
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
}

.dshpub-empty {
  padding: 56px 20px;
  border-top: 1px solid var(--dsw-alias-border-l2);
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  text-align: center;
}

.dshpub-empty h4 {
  margin: 0 0 8px;
  font-size: 15px;
}

.dshpub-empty p {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}

.dshpub-footer {
  display: flex;
  gap: 20px;
  align-items: center;
  justify-content: space-between;
  padding-top: 18px;
}

.dshpub-pagination {
  display: flex;
  gap: 8px;
  align-items: center;
}

.dshpub-pagination button {
  min-height: 30px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  padding: 5px 10px;
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.dshpub-pagination button:disabled {
  cursor: default;
  opacity: .45;
}

.dshpub-directory button:focus-visible, .dshpub-directory a:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
}

@media (max-width: 1050px) {
  .dshpub-controls { grid-template-columns: minmax(220px, 2fr) repeat(3, minmax(112px, 1fr)); }
}

@container dshpub (max-width: 1050px) {
  .dshpub-controls { grid-template-columns: minmax(220px, 2fr) repeat(3, minmax(112px, 1fr)); }
}

@container dshpub (max-width: 620px) {
  .dshpub-capability-bus, .dshpub-controls { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dshpub-search-field { grid-column: 1 / -1; }
  .dshpub-entry { grid-template-columns: 1fr; gap: 9px; }
  .dshpub-entry-side { max-width: none; justify-content: flex-start; }
}

@media (max-width: 760px) {
  .dshpub-directory { padding: 24px 18px 32px; }
  .dshpub-header { grid-template-columns: 1fr; }
  .dshpub-snapshot { padding-left: 12px; }
  .dshpub-capability-bus { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dshpub-controls { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dshpub-search-field { grid-column: 1 / -1; }
  .dshpub-entry { grid-template-columns: 1fr; gap: 9px; }
  .dshpub-entry-side { max-width: none; justify-content: flex-start; }
  .dshpub-footer { align-items: flex-start; flex-direction: column; }
}

@media (max-width: 480px) {
  .dshpub-capability-bus, .dshpub-controls { grid-template-columns: 1fr; }
  .dshpub-section-heading { align-items: flex-start; flex-direction: column; gap: 4px; }
}

@media (prefers-reduced-motion: reduce) {
  .dshpub-topic { transition: none; }
}
`;
