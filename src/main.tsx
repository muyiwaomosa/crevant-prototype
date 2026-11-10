// Entry point of the full app (Preview and local): the public site plus
// invited members' sign in and account pages.
import { boot } from './boot'
import { PublicApp } from './public/PublicApp'

boot(PublicApp)
