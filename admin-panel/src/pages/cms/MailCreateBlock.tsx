import { Block } from '../../components/CmsOperationsUi';

export function MailCreateBlock({
  createKey,
  createName,
  isLoading,
  onCreateKeyChange,
  onCreateNameChange,
  onCreate,
  onImportDefaults,
}: {
  createKey: string;
  createName: string;
  isLoading: boolean;
  onCreateKeyChange: (value: string) => void;
  onCreateNameChange: (value: string) => void;
  onCreate: () => void;
  onImportDefaults: () => void;
}) {
  return (
    <Block title="Создать шаблон">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input className="input-field" placeholder="key (например: registration_confirm)" value={createKey} onChange={(event) => onCreateKeyChange(event.target.value)} />
        <input className="input-field" placeholder="Название" value={createName} onChange={(event) => onCreateNameChange(event.target.value)} />
        <button className="btn-primary" disabled={isLoading || !createKey.trim()} onClick={onCreate}>Создать</button>
      </div>
      <div>
        <button className="btn-secondary" disabled={isLoading} onClick={onImportDefaults}>Импортировать стартовые шаблоны</button>
      </div>
    </Block>
  );
}
