import Image from "next/image";

export default function InlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-12 text-text">
      <div className="w-full max-w-md">
        <Image src="/brand/logo-gestapeld-kleur.png" alt="MakelaarsCockpit" width={400} height={150} priority unoptimized className="mx-auto mb-8 h-24 w-auto" />
        <div className="rounded-lg border border-border bg-surface p-8">{children}</div>
      </div>
    </main>
  );
}
