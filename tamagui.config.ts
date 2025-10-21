import { defaultConfig } from '@tamagui/config/v4'
import { createTamagui } from 'tamagui'

const appConfig = createTamagui({
  ...defaultConfig,
})

export const tamaguiConfig = appConfig

export default tamaguiConfig

export type Conf = typeof tamaguiConfig

declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}