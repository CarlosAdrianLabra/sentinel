import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen flex">
      {/* Sidebar fijo — solo desktop */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Navegación mobile (hamburguesa + overlay + sidebar deslizante) */}
      <MobileNav />

      <main className="flex-1 overflow-auto pt-16 md:pt-0">{children}</main>
    </div>
  );
}
