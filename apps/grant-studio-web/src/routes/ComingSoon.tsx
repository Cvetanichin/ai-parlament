import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

// Project Operations, Knowledge Hub, and Executive Dashboard have no
// grant-stream-studio source material to port (see the consolidation plan's
// "deliberately deferred" section) -- this shell section exists in nav now
// so those sections slot in later without restructuring the shell, but
// their design is out of scope for this build.
export function ComingSoon({ section }: { section: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{section}</CardTitle>
        <CardDescription>Not yet built — planned as a later phase within this shell.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        This section shares auth, navigation, and the Human Gate component with the rest of the app
        (docs/13-Frontend §1) once it's built.
      </CardContent>
    </Card>
  );
}
