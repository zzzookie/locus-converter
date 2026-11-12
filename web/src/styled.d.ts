import 'styled-components';
import type { Theme as MuiTheme } from '@mui/material/styles';

declare module 'styled-components' {
  // Совмещаем тему styled-components с темой Material UI.
  export interface DefaultTheme extends MuiTheme {}
}
