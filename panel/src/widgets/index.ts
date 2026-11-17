import { Chart, Gauge, Stat } from './computer'
import { Button, Feeder, Keys, Launcher } from './controls'
import { Battery, Services, System, Wifi } from './deck'
import { Audio, Media } from './media'
import { Analog, Clock, Title } from './time'
import type { WidgetDef } from './types'
import { Forza, News, Notifications, PushedValue, Weather } from './web'

// type (as in panel/widgets.json) → component. A type in the catalogue
// without an entry here renders as "unknown widget" instead of crashing.
export const WIDGETS: Record<string, WidgetDef> = {
  clock: { C: Clock },
  analog: { C: Analog },
  title: { C: Title, bare: true },
  gauge: { C: Gauge },
  stat: { C: Stat },
  chart: { C: Chart },
  services: { C: Services },
  battery: { C: Battery },
  wifi: { C: Wifi },
  system: { C: System },
  media: { C: Media },
  audio: { C: Audio, bare: true },
  keys: { C: Keys, bare: true },
  button: { C: Button, bare: true },
  launcher: { C: Launcher, bare: true },
  feeder: { C: Feeder },
  weather: { C: Weather },
  news: { C: News },
  forza: { C: Forza },
  pushed: { C: PushedValue },
  notifications: { C: Notifications },
}
