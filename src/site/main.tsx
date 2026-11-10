// Entry point of the public site build (vite build --mode site): the landing
// page, /join, /privacy and the sample tour, with no member pages (see
// SiteApp). The production demo address still gets the sample prototype,
// exactly like the full app, unless this is an APPROVED Vercel Production
// build (scripts/guard-build-target.mjs), which is what replaces the demo.
import { boot } from '../boot'
import { PRODUCTION_SITE_APPROVED } from '../build-flags'
import { SiteApp } from './SiteApp'

boot(SiteApp, { demoFallback: !PRODUCTION_SITE_APPROVED })
