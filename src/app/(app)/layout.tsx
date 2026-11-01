import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { AutoSyncBoundary } from "@/components/auto-sync-boundary";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto bg-background-200 p-4 lg:p-6">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
      <AutoSyncBoundary />
    </div>
  );
}
