import TrustVault from "@/components/trustvault";
import { workspaceMode } from "@/lib/workspace-mode";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <TrustVault
      mode={workspaceMode()}
      maxUploadMb={
        process.env.VERCEL === "1" && workspaceMode() !== "demo" ? 4 : 5
      }
    />
  );
}
