// Entry point of the public site build (vite build --mode site): the landing
// page, /join and the sample tour, with no member pages (see SiteApp). The
// production demo address still gets the sample prototype, exactly like the
// full app, until a reviewed change moves Production to this build.
import { boot } from '../boot'
import { SiteApp } from './SiteApp'

boot(SiteApp)
