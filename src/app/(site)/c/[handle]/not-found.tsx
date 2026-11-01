import { Container } from "@/components/site/container";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function CreatorNotFound() {
  return (
    <Container className="py-16 sm:py-24">
      <p className="eyebrow">404 · Profil</p>
      <h1 className="mt-4 max-w-3xl font-display text-[40px] leading-[0.92] font-extrabold tracking-[-0.055em] sm:text-[64px]">
        Dieses Profil gibt es nicht (mehr).
      </h1>
      <EmptyState
        className="mt-10 max-w-3xl"
        title="Vielleicht ein Tippfehler im Handle?"
        description="Oder das Profil ist noch in Prüfung beziehungsweise nicht mehr öffentlich. Auf der Entdecken-Seite findest du alle freigeschalteten Creator."
        action={
          <ButtonLink href="/explore" variant="primary" size="sm">
            Creator entdecken
          </ButtonLink>
        }
      />
    </Container>
  );
}
