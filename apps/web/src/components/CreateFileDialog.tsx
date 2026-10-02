import { useState, type FormEvent } from "react";
import type { FileRecord, FileType } from "@collab/shared";
import { Button } from "./ui/Button";
import { Field } from "./ui/Field";
import { Modal } from "./ui/Modal";
import { Segmented } from "./ui/Segmented";
import { FILE_KINDS } from "./layout/ProjectNav";

const EXAMPLE: Record<FileType, string> = { code: "main.py", doc: "README.md", board: "идеи.board" };
const HINT: Record<FileType, string> = {
  code: "Язык определяется по расширению: .py, .js, .ts, .go, .rs и т. д.",
  doc: "Markdown с живым предпросмотром — удобно для заметок и заданий.",
  board: "Бесконечное полотно для схем и набросков — рисуют все сразу.",
};

export function CreateFileDialog({
  initialType,
  files,
  onClose,
  onCreate,
}: {
  initialType: FileType;
  files: FileRecord[];
  onClose: () => void;
  onCreate: (path: string, type: FileType) => void;
}) {
  const [type, setType] = useState<FileType>(initialType);
  const [path, setPath] = useState("");
  const trimmed = path.trim();
  const duplicate = files.some((file) => file.path === trimmed);
  const invalid = trimmed.startsWith("/") || trimmed.endsWith("/") || trimmed.includes("..");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (trimmed && !duplicate && !invalid) {
      onCreate(trimmed, type);
      onClose();
    }
  }

  return (
    <Modal title="Новый файл" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Segmented
          label="Тип файла"
          value={type}
          onChange={setType}
          options={(Object.keys(FILE_KINDS) as FileType[]).map((value) => {
            const kind = FILE_KINDS[value];
            return { value, label: kind.label, icon: <kind.icon size={20} className={kind.tone} /> };
          })}
        />
        <Field
          label="Имя файла"
          placeholder={EXAMPLE[type]}
          value={path}
          onChange={(event) => setPath(event.target.value)}
          hint={
            duplicate ? <span className="text-bad">Файл с таким именем уже есть</span> : invalid ? (
              <span className="text-bad">Имя не должно начинаться или заканчиваться на «/» и содержать «..»</span>
            ) : (
              HINT[type]
            )
          }
        />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" disabled={!trimmed || duplicate || invalid}>
            Создать
          </Button>
        </div>
      </form>
    </Modal>
  );
}
