import Image from "next/image";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { uitloggen } from "@/app/inloggen/acties";
import { Navigatie } from "./navigatie";

export function AppSchil({ kantoor, gebruiker, beheerder, children }: { kantoor: string; gebruiker: string; beheerder: boolean; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-text">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-surface px-4 md:px-6">
        <Link href="/" aria-label="MakelaarsCockpit, naar het overzicht">
          <Image src="/brand/logo-horizontaal-kleur.png" alt="MakelaarsCockpit" width={600} height={76} priority unoptimized className="h-7 w-auto" />
        </Link>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-label">{gebruiker}</p>
            <p className="text-caption text-text-muted">{kantoor}</p>
          </div>
          <form action={uitloggen}>
            <button type="submit" title="Uitloggen" aria-label="Uitloggen" className="flex size-10 items-center justify-center rounded-md text-text-muted transition-colors duration-150 hover:bg-primary-subtle hover:text-primary">
              <LogOut aria-hidden size={20} strokeWidth={1.75} />
            </button>
          </form>
        </div>
      </header>
      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="border-b border-border bg-surface md:w-64 md:shrink-0 md:border-b-0 md:border-r">
          <Navigatie beheerder={beheerder} />
        </aside>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto flex max-w-6xl flex-col gap-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
