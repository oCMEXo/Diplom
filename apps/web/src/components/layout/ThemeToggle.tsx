import { Moon, Sun } from "lucide-react";
import { useTheme } from "../../lib/theme";
import { IconButton } from "../ui/Button";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <IconButton label={theme === "dark" ? "Светлая тема" : "Тёмная тема"} onClick={toggle}>
      {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
    </IconButton>
  );
}
