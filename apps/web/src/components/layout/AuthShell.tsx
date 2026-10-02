import type { ReactNode } from "react";
import { Boxes, MessagesSquare, PenTool, Users } from "lucide-react";
import { Wordmark } from "../ui/Logo";
import { ThemeToggle } from "./ThemeToggle";

const FEATURES = [
  { icon: Users, text: "Заходите по ссылке — даже без регистрации" },
  { icon: Boxes, text: "Код, документы и доски в одном проекте" },
  { icon: MessagesSquare, text: "Чат и курсоры коллег рядом с работой" },
  { icon: PenTool, text: "Правки сохраняются офлайн и сливаются сами" },
];

function MockEditor() {
  return (
    <div className="relative w-full max-w-md animate-float rounded-2xl border border-white/10 bg-black/35 p-4 font-mono text-[13px] leading-6 text-white/80 shadow-2xl backdrop-blur">
      <div className="mb-3 flex gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#f87171]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#fbbf24]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#34d399]" />
        <span className="ml-3 text-xs text-white/40">main.py</span>
      </div>
      <p>
        <span className="text-[#c4b5fd]">def</span> <span className="text-[#93c5fd]">greet</span>(name):
      </p>
      <p className="relative">
        {"    "}
        <span className="text-[#c4b5fd]">return</span> <span className="text-[#86efac]">f&quot;Привет, {"{name}"}!&quot;</span>
        <span className="absolute -top-1 left-[19.5rem] hidden sm:block">
          <Cursor color="#34d399" name="Аня" />
        </span>
      </p>
      <p>&nbsp;</p>
      <p className="relative">
        <span className="text-[#93c5fd]">print</span>(greet(<span className="text-[#86efac]">&quot;команда&quot;</span>))
        <span className="absolute -top-0.5 left-[13rem] hidden sm:block">
          <Cursor color="#f472b6" name="Влад" delay />
        </span>
      </p>
    </div>
  );
}

function Cursor({ color, name, delay }: { color: string; name: string; delay?: boolean }) {
  return (
    <span className={`flex items-start ${delay ? "animate-float [animation-delay:-3s]" : "animate-float"}`}>
      <svg width="14" height="18" viewBox="0 0 14 18" fill={color}>
        <path d="M1 1v14l3.6-3.4 2.6 5.4 2-1-2.6-5.2H12z" stroke="#fff" strokeWidth="1" />
      </svg>
      <span style={{ backgroundColor: color }} className="-ml-0.5 mt-3.5 rounded px-1.5 py-0.5 font-sans text-[10px] font-semibold text-black/75">
        {name}
      </span>
    </span>
  );
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[#0b0d18] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-[#6d5bff]/40 blur-[110px]" />
        <div className="pointer-events-none absolute -bottom-40 right-0 h-[26rem] w-[26rem] rounded-full bg-[#ec4899]/25 blur-[120px]" />
        <div className="relative z-10 text-white">
          <Wordmark />
        </div>
        <div className="relative z-10 space-y-8">
          <h2 className="max-w-md text-4xl font-semibold leading-tight tracking-tight">
            Общее пространство, где проект делается <span className="text-[#a99cff]">вместе</span>
          </h2>
          <MockEditor />
          <ul className="grid max-w-md gap-3 text-sm text-white/70">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-[#c4b5fd]">
                  <Icon size={16} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative z-10 text-xs text-white/40">Дипломный проект · CRDT (Yjs) · Hocuspocus</p>
      </aside>

      <main className="relative flex items-center justify-center px-5 py-10">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm animate-pop">
          <div className="mb-8 lg:hidden">
            <Wordmark />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mb-6 mt-1.5 text-sm text-muted">{subtitle}</p>
          {children}
        </div>
      </main>
    </div>
  );
}
