// Stakeholder journey 4: the FOUNDER, as one continuous story through the
// Control Center and the pages it links to, in a real browser against a LOCAL
// Supabase with real Auth, real email (Mailpit) and the production security
// headers. The founder operates every engine: registration and invitations,
// governance, advertising, rewards and reconciliation, intelligence,
// operations and privacy. Members act in their own browsers along the way.
//
//  1. Registration: pause with a reason (a registration is refused), then
//     reopen with a reason.
//  2. Invitations: a link attributed to a creator; Pat joins through it, sees
//     who invited her and follows by choice; the link counts her; the founder
//     stops it and it no longer works.
//  3. Acquisition and activation figures match the database.
//  4. Moderation: a reported comment is hidden; the notice reaches its author,
//     who is never told who reported it.
//  5. Advertising: the founder reviews a member's request, approves it,
//     creates and activates a campaign; a member who chose the category sees it.
//  6. Operational switches: ads off (no ad is served, nothing is recorded),
//     then on again, each with a reason; video posts cannot be turned on yet.
//  7. The campaign report: aggregate, small groups withheld, no member named.
//  8. Rewards: a qualified referral is approved; simulated revenue is recorded
//     and a finished month closes, reconciling to the cent, only once.
//  9. Privacy: a deletion request; a wrong username is refused, the right one
//     deletes the account, its posts and follows; nobody else's totals change.
// 10. Intelligence: the North Star and figures match the database with test
//     data counted apart, every figure labelled, no member named.
// WCAG 2.2 AA at 320 and 390 px on key screens, no sideways scrolling, no CSP
// violations. Run by scripts/e2e/auth-journey.sh.
const { readFileSync } = require('node:fs')
const { journey } = require('./lib/stakeholder.cjs')

const J = journey('Founder journey', 'Founder-Journey-42-pass')
const { APP, RUN, flat, sleep, check, step, sql, sqlEventually, screenChecks, person, createMember, tokenFor, rpc, founderAccount, signIn, registerThrough, nameStep, idOf, nav } = J

J.run(async (browser) => {
  const email = (k) => `sf-${k}-${RUN}@example.test`
  const user = (k) => `sf${k}${RUN}`
  const business = `Little Steps ${RUN}`
  const campaign = `Back to school ${RUN}`
  // The founder starts from an open registration, as staging would be.
  sql("select ops.set_registration_settings('stakeholder-founder', 'journey: start open', false, 200, 25, 5)")
  const founder = await founderAccount()
  if (sql(`select ops.moderator_active('${founder.id}')`) !== 't') sql(`select ops.grant_moderator('${founder.id}', 'stakeholder-founder', 'the founder moderates during the pilot')`)

  // The members around the founder, set up through their own accounts.
  const gil = await createMember(email('g'), user('g'), 'Gil Grows', 'creator') // a real creator cohort: her connections count as actual
  await createMember(email('r'), user('r'), 'Rex Rude')
  const ria = await createMember(email('i'), user('i'), 'Ria Refers')
  await createMember(email('a'), user('a'), 'Ana Ads')
  const vi = await createMember(email('v'), user('v'), 'Vi Viewer')
  const dee = await createMember(email('d'), user('d'), 'Dee Leaving')
  const tG = await tokenFor(email('g'))
  const posts = []
  for (const body of [`Packed lunches the kids actually eat ${RUN}`, `Five snacks for after school ${RUN}`]) {
    const p = (await rpc(tG, 'app_create_post', { p_body: body })).body
    await rpc(tG, 'app_set_post_topic', { p_post: p, p_topic: 'food' })
    posts.push(p)
  }
  await rpc(tG, 'app_set_creator_topics', { p_topics: ['food', 'family'] })
  const tR = await tokenFor(email('r'))
  const comment = (await rpc(tR, 'app_add_comment', { p_post: posts[0], p_body: `Nobody wants your boring lunches, give up ${RUN}` })).body
  await rpc(tG, 'app_report', { p_target_type: 'comment', p_target_id: comment, p_reason: 'harassment', p_details: null })
  const reportId = sql(`select id from ops.content_reports where target_type = 'comment' and target_id = '${comment}'`)
  const tA = await tokenFor(email('a'))
  await rpc(tA, 'app_request_advertising', { p: { name: business, website: 'https://littlesteps.example', offering: 'School shoes that grow with your child', problem_solved: 'Kids outgrow shoes in months', desired_outcome: 'One pair for the whole school year', customer_needs: 'Parents of school-age children', objective: 'sales', conversion_action: 'Buy a first pair', categories: ['kids_family'] } })
  const tV = await tokenFor(email('v'))
  await rpc(tV, 'app_set_ad_preference', { p_category: 'kids_family', p_state: 'chosen' })
  await rpc(tV, 'app_follow', { p_creator: gil })
  const tD = await tokenFor(email('d'))
  await rpc(tD, 'app_create_post', { p_body: `Dee's last post ${RUN}` })
  await rpc(tD, 'app_follow', { p_creator: gil })
  await rpc(tD, 'app_save', { p_post: posts[0] })
  const riaCode = (await rpc(await tokenFor(email('i')), 'app_my_referral_link')).body
  const riaLink = `${APP}/register/${riaCode}`

  const fay = await person(browser)
  await fay.ctx.grantPermissions(['clipboard-read', 'clipboard-write'])
  const fp = fay.page
  await signIn(fp, founder.email)
  await nav(fp).getByTitle('Profile').click()
  await fp.getByRole('link', { name: 'Control Center' }).click()
  await fp.getByTestId('control-center').waitFor()
  const regPanel = fp.getByTestId('registration-panel')
  const linksPanel = fp.getByTestId('invitation-links-panel')
  const switches = fp.getByTestId('switches-panel')
  const privacy = fp.getByTestId('privacy-requests-panel')

  // ---------------------------------------------------------------------------
  step('1. Registration: pause with a reason, then reopen with a reason')
  await regPanel.getByText('Registration is open').waitFor()
  await screenChecks(fp, 'the Control Center')
  await regPanel.getByLabel('Accept new registrations through invitation and personal links').uncheck()
  await regPanel.getByLabel('Reason (recorded)').fill('Journey: pausing to review the first week')
  await regPanel.getByRole('button', { name: 'Save registration settings' }).click()
  await regPanel.getByText('Saved and recorded.').waitFor()
  await regPanel.getByText('Registration is paused').waitFor()
  check('pausing is stored with the reason', sql('select paused from ops.registration_settings where id') === 't'
    && sql("select reason from ops.registration_setting_events order by id desc limit 1") === 'Journey: pausing to review the first week')
  {
    const tryReg = await person(browser)
    await tryReg.page.goto(riaLink)
    await tryReg.page.getByTestId('register-form').waitFor()
    await tryReg.page.getByLabel('Email address', { exact: true }).fill(email('paused'))
    await tryReg.page.getByLabel('Password', { exact: true }).fill(J.PASSWORD)
    await tryReg.page.getByLabel('Confirm password').fill(J.PASSWORD)
    await tryReg.page.getByLabel('I confirm that I am 18 or older.').check()
    await tryReg.page.getByRole('button', { name: 'Create account' }).click()
    await tryReg.page.getByText('Registration is paused right now. Please try again later, or join the waitlist.').waitFor()
    check('while paused, registration through a link is refused and no account is made', sql(`select count(*) from auth.users where email = '${email('paused')}'`) === '0')
    await tryReg.ctx.close()
  }
  await regPanel.getByLabel('Accept new registrations through invitation and personal links').check()
  await regPanel.getByLabel('Reason (recorded)').fill('Journey: reopening after the review')
  await regPanel.getByRole('button', { name: 'Save registration settings' }).click()
  await regPanel.getByText('Registration is open').waitFor()
  check('reopening is stored with its reason', sql('select paused from ops.registration_settings where id') === 'f'
    && sql("select reason from ops.registration_setting_events order by id desc limit 1") === 'Journey: reopening after the review')

  // ---------------------------------------------------------------------------
  step('2. Invitations: a creator-attributed link, someone joins through it, the founder stops it')
  await linksPanel.getByLabel("Creator's username (optional)").fill(user('g'))
  await linksPanel.getByLabel('People who can join').fill('5')
  await linksPanel.getByLabel('Days it lasts').fill('14')
  await linksPanel.getByRole('button', { name: 'Create link' }).click()
  const linkItem = linksPanel.getByRole('listitem').filter({ hasText: `For @${user('g')}` }).first()
  await linkItem.waitFor()
  check('the link is listed for the creator, unused', flat(await linkItem.innerText()).includes('0 joined · 0 of 5 used'), flat(await linkItem.innerText()))
  await linkItem.getByRole('button', { name: 'Copy link' }).click()
  await linkItem.getByRole('button', { name: 'Copied' }).waitFor()
  const giLink = await fp.evaluate(() => navigator.clipboard.readText())
  const giCode = (giLink.match(/\/register\/([0-9a-f]{16})$/) || [])[1]
  check('the copied link is an invitation attributed to the creator, as a fan cohort',
    sql(`select kind || '|' || cohort || '|' || (creator_id = '${gil}') || '|' || max_uses from ops.registration_links where code = '${giCode}'`) === 'invitation|fan|true|5')
  const pat = await person(browser)
  await registerThrough(pat.page, giLink, email('p'))
  const p = idOf(email('p'))
  await nameStep(pat.page, user('p'), 'Pat Parent')
  await pat.page.getByRole('button', { name: 'Skip the rest' }).click()
  const inviter = pat.page.getByTestId('inviter-card')
  await inviter.waitFor()
  check('Pat sees she is here because of the creator', flat(await inviter.innerText()).includes("You're here because of Gil Grows"))
  check('nobody is followed for her', sql(`select count(*) from social.follows where follower_id = '${p}'`) === '0')
  await inviter.getByRole('button', { name: 'Follow Gil Grows' }).click()
  await inviter.getByText("You're following Gil Grows.").waitFor()
  await pat.page.getByRole('button', { name: 'Continue', exact: true }).click()
  await pat.page.getByRole('button', { name: 'Go to my feed' }).click()
  await pat.page.getByRole('heading', { name: 'Home' }).waitFor()
  await pat.page.goto(`${APP}/app/post/${posts[0]}`)
  check('Pat opens the creator\'s post: a connection between two real members', await sqlEventually(`select count(*) from ops.connections(ops.week_start(now()), now()) where consumer = '${p}' and creator = '${gil}' and not test`, '1') === '1')
  await pat.ctx.close()
  check('Pat\'s registration is the invitation, attributed to the creator, with no referrer',
    sql(`select kind || '|' || (creator_id = '${gil}') || '|' || coalesce(referrer_id::text, 'none') from ops.registrations where user_id = '${p}'`) === 'invitation|true|none')
  await fp.reload()
  await linksPanel.getByRole('listitem').filter({ hasText: `For @${user('g')}` }).first().waitFor()
  const used = flat(await linksPanel.getByRole('listitem').filter({ hasText: `For @${user('g')}` }).first().innerText())
  check('the link now counts her: 1 joined, 1 of 5 used', used.includes('1 joined · 1 of 5 used'), used)
  await linksPanel.getByRole('listitem').filter({ hasText: `For @${user('g')}` }).first().getByRole('button', { name: 'Stop this link' }).click()
  await linksPanel.getByRole('listitem').filter({ hasText: `For @${user('g')}` }).first().getByText('Stopped').waitFor()
  check('the stopped link is recorded and offers no copy', sql(`select revoked_at is not null from ops.registration_links where code = '${giCode}'`) === 't'
    && (await linksPanel.getByRole('listitem').filter({ hasText: `For @${user('g')}` }).first().getByRole('button', { name: 'Copy link' }).count()) === 0)
  {
    const late = await person(browser)
    await late.page.goto(giLink)
    await late.page.getByTestId('register-form').waitFor()
    await late.page.getByLabel('Email address', { exact: true }).fill(email('late'))
    await late.page.getByLabel('Password', { exact: true }).fill(J.PASSWORD)
    await late.page.getByLabel('Confirm password').fill(J.PASSWORD)
    await late.page.getByLabel('I confirm that I am 18 or older.').check()
    await late.page.getByRole('button', { name: 'Create account' }).click()
    await late.page.getByText("This invitation or referral link isn't valid. Ask the person who shared it for a new one.").waitFor()
    check('a stopped link no longer registers anyone', sql(`select count(*) from auth.users where email = '${email('late')}'`) === '0')
    await late.ctx.close()
  }

  // ---------------------------------------------------------------------------
  step('3. Acquisition and activation figures match the database')
  // Rob joins through Ria's personal link (a referral) and makes his own first follow.
  const rob = await person(browser)
  await registerThrough(rob.page, riaLink, email('o'))
  const o = idOf(email('o'))
  await nameStep(rob.page, user('o'), 'Rob Referred')
  await rob.page.getByRole('button', { name: 'Skip the rest' }).click()
  await rob.page.getByTestId('inviter-card').getByRole('button', { name: 'Not now' }).click()
  await rob.page.getByRole('button', { name: 'Continue', exact: true }).click()
  await rob.page.getByRole('button', { name: 'Go to my feed' }).click()
  await rob.page.goto(`${APP}/app/u/${user('g')}`)
  await rob.page.getByRole('button', { name: 'Follow Gil Grows' }).click()
  await rob.page.getByTestId('follow-confirmation').waitFor()
  await rob.ctx.close()
  check('Rob\'s own first follow makes Ria\'s referral qualified, waiting for review',
    await sqlEventually(`select string_agg(points || ':' || status, ',') from sim.points_ledger where member_id = '${ria}' and action = 'qualified_referral'`, '100:pending_review') === '100:pending_review')
  await fp.reload()
  await fp.getByTestId('control-center').waitFor()
  const health = flat(await fp.getByTestId('control-center').innerText())
  const week = "ops.week_start(now())"
  const regWeek = sql(`select count(*) from ops.registrations where claimed_at >= ${week}`)
  const cap = sql('select total_cap from ops.registration_settings where id')
  check('Registrations this week match the database, with the cap and "open"', health.includes(`Registrations Actual ${regWeek} this week Cap ${cap} · open`), `${regWeek}: ${health.slice(0, 400)}`)
  const elig = sql("select count(*) from ops.registrations where claimed_at < now() - interval '7 days'")
  const act = sql(`select count(*) from ops.registrations r where r.claimed_at < now() - interval '7 days'
    and exists (select 1 from social.follows f where f.follower_id = r.user_id and f.followed_at < r.claimed_at + interval '7 days')
    and exists (select 1 from ops.connections(r.claimed_at, r.claimed_at + interval '7 days') c where c.consumer = r.user_id)`)
  check('Activation (7 days) matches the database', health.includes(`${act} of ${elig} new members`), `${act}/${elig}`)
  check('both new members are counted this week (Pat by invitation, Rob by referral)', sql(`select count(*) from ops.registrations where user_id in ('${p}', '${o}') and claimed_at >= ${week}`) === '2')

  // ---------------------------------------------------------------------------
  step('4. Moderation: hide a reported comment; the notice reaches its author')
  await fp.getByRole('navigation', { name: 'Control Center sections' }).getByRole('link', { name: 'Moderation' }).click()
  const queue = fp.getByRole('list', { name: 'Open reports' })
  await queue.waitFor()
  await queue.locator(`a[href$="/app/moderation/${reportId}"]`).click()
  await fp.getByRole('heading', { name: 'Harassment or bullying: comment' }).waitFor()
  check('the report shows what was reported', (await fp.getByText(`Nobody wants your boring lunches, give up ${RUN}`).count()) >= 1)
  await screenChecks(fp, 'the moderation report')
  await fp.getByLabel('Note for the record (optional)').fill('Harassment of the creator.')
  await fp.getByRole('button', { name: 'Hide', exact: true }).click()
  await fp.getByText('Hidden. Members can no longer see it.').waitFor()
  check('the comment is hidden and the action is in the audit trail', sql(`select hidden_at is not null from social.comments where id = '${comment}'`) === 't'
    && sql(`select action || ':' || (actor_id = '${founder.id}') from ops.moderation_actions where target_id = '${comment}' order by id desc limit 1`) === 'hide:true')
  {
    const rx = await person(browser)
    await signIn(rx.page, email('r'))
    const banner = rx.page.getByTestId('governance-banner')
    await banner.waitFor()
    check('Rex\'s Home says he has a new notice', /a new notice/.test(await banner.innerText()))
    await banner.getByRole('link', { name: 'See your notices' }).click()
    const notice = rx.page.getByTestId('notice').filter({ hasText: 'We hid your comment' })
    await notice.waitFor()
    const all = await rx.page.locator('main').innerText()
    check('the notice says why, and never who reported it', (await notice.innerText()).includes('harassment or bullying') && !all.includes('Gil Grows') && !all.includes(user('g')))
    await rx.ctx.close()
  }

  // ---------------------------------------------------------------------------
  step('5. Advertising: review the member\'s request, approve it, create and activate a campaign')
  await fp.goto(`${APP}/app/control`)
  await fp.getByRole('navigation', { name: 'Control Center sections' }).getByRole('link', { name: 'Advertisers and campaigns' }).click()
  const adv = fp.getByRole('list', { name: 'Advertisers' }).getByRole('listitem').filter({ hasText: business })
  await adv.waitFor()
  check('the request shows who asked, from their own account', flat(await adv.innerText()).includes(`Requested by @${user('a')} from their account`))
  await adv.getByRole('button', { name: `Approve ${business}` }).click()
  await adv.getByText('approved').waitFor()
  await fp.getByLabel('Advertiser (approved)').selectOption({ label: business })
  await fp.getByLabel('Campaign name').fill(campaign)
  await fp.getByLabel('Headline').fill(`Shoes that last the school year ${RUN}`)
  await fp.getByLabel('Text').fill('Adjustable school shoes for growing feet.')
  await fp.getByLabel('Button label').fill('See the shoes')
  await fp.getByLabel('Landing page').fill('https://littlesteps.example/shoes')
  await fp.getByLabel('Simulated price ($)').fill('60')
  await fp.getByRole('group', { name: 'Commercial categories (from onboarding)' }).getByLabel('Kids & family products').check()
  await fp.getByRole('button', { name: 'Save campaign (as draft)' }).click()
  await fp.getByRole('button', { name: `Activate ${campaign}` }).click()
  await fp.getByRole('button', { name: `Pause ${campaign}` }).waitFor()
  check('the campaign is active for the approved advertiser', sql(`select c.status || '|' || a.status from ads.campaigns c join ads.advertisers a on a.id = c.advertiser_id where c.name = '${campaign}'`) === 'active|approved')
  const imps = () => sql(`select count(*) from ads.impressions i join ads.campaigns c on c.id = i.campaign_id where c.name = '${campaign}' and i.member_id = '${vi}'`)
  const viewer = await person(browser)
  await signIn(viewer.page, email('v'))
  await viewer.page.bringToFront()
  await viewer.page.goto(`${APP}/app/post/${posts[0]}`)
  const ad = viewer.page.getByTestId('ad')
  await ad.waitFor()
  check('Vi, who chose the category, sees the ad labelled Sponsored', flat(await ad.innerText()).toLowerCase().includes("sponsored · shown with gil grows's post") && imps() === '1')
  check('the ad she saw counts as a valid impression', await sqlEventually(`select count(*) from ads.impressions i join ads.campaigns c on c.id = i.campaign_id where c.name = '${campaign}' and i.viewed_at is not null`, '1') === '1')

  // ---------------------------------------------------------------------------
  step('6. Operational switches: advertising off (no ad served), then on, each with a reason')
  await fp.goto(`${APP}/app/control`)
  await switches.waitFor()
  await switches.getByText('Advertising: On').waitFor()
  // New video uploads are offered only once both phone device tests passed and the storage cap is set
  // (the video journey records them when it runs first).
  if (sql('select ops.video_ready()') === 't') {
    check('video uploads can be switched once the device tests passed and the cap is set', (await switches.getByRole('button', { name: /^Turn new video uploads (on|off)$/ }).count()) === 1)
  } else {
    check('video posts cannot be turned on before the device tests pass', await switches.getByRole('button', { name: 'Turn new video uploads on' }).isDisabled())
  }
  await switches.getByLabel('Reason', { exact: true }).fill('Journey: pausing ads to review a complaint')
  await switches.getByRole('button', { name: 'Turn advertising off' }).click()
  await switches.getByText('Advertising: Off').waitFor()
  check('ads are off, with the reason recorded', sql("select enabled from ops.feature_switches where feature = 'ads'") === 'f'
    && sql("select reason from ops.feature_switch_events where feature = 'ads' order by id desc limit 1") === 'Journey: pausing ads to review a complaint')
  await viewer.page.goto(`${APP}/app/post/${posts[1]}`)
  await viewer.page.getByText(`Five snacks for after school ${RUN}`).first().waitFor()
  await sleep(1500)
  check('while ads are off, no ad is shown and none is served', (await viewer.page.getByTestId('ad').count()) === 0 && imps() === '1')
  const off = await rpc(tV, 'app_ad_for', { p_surface: 'content', p_post: posts[1] })
  check('the database serves no ad while off, even when asked directly', off.status === 200 && Array.isArray(off.body) && off.body.length === 0 && imps() === '1')
  await screenChecks(fp, 'the Control Center with ads off')
  await switches.getByLabel('Reason', { exact: true }).fill('Journey: complaint reviewed, ads back on')
  await switches.getByRole('button', { name: 'Turn advertising on' }).click()
  await switches.getByText('Advertising: On').waitFor()
  await switches.getByText('Recent changes').click()
  const recent = flat(await switches.getByRole('listitem').filter({ hasText: 'ads' }).allInnerTexts().then((x) => x.join(' | ')))
  check('both changes and their reasons are listed', recent.includes('ads off. Journey: pausing ads to review a complaint') && recent.includes('ads on. Journey: complaint reviewed, ads back on'), recent)
  await viewer.page.bringToFront()
  await viewer.page.goto(`${APP}/app/post/${posts[1]}`)
  await viewer.page.getByTestId('ad').waitFor()
  check('with ads back on, the ad is served again', imps() === '2')
  check('both impressions become valid once seen', await sqlEventually(`select count(*) from ads.impressions i join ads.campaigns c on c.id = i.campaign_id where c.name = '${campaign}' and i.viewed_at is not null`, '2') === '2')
  await viewer.ctx.close()

  // ---------------------------------------------------------------------------
  step('7. The campaign report: aggregate, small groups withheld, nobody named')
  await fp.goto(`${APP}/app/ads`)
  await fp.getByRole('button', { name: `Report for ${campaign}` }).click()
  const rep = fp.getByTestId('campaign-report')
  await rep.waitFor()
  await rep.getByText(/Valid impressions/).first().waitFor()
  const tr = flat(await rep.innerText())
  check('the report counts 2 valid impressions and 0 clicks, as in the database', /Valid impressions 2 /.test(tr) && /Outbound clicks 0 /.test(tr), tr)
  check('audience and reach under 10 are withheld', /Eligible audience \(chose a matching category\) fewer than 10/.test(tr) && /Reach fewer than 10/.test(tr), tr)
  check('the report names no member', !tr.includes('Vi Viewer') && !tr.includes(user('v')) && !tr.includes(vi))
  await screenChecks(fp, 'the campaign report')

  // ---------------------------------------------------------------------------
  step('8. Rewards: approve the referral, record simulated revenue, close a month that reconciles')
  await fp.goto(`${APP}/app/control`)
  await fp.getByRole('navigation', { name: 'Control Center sections' }).getByRole('link', { name: 'Rewards and reconciliation' }).click()
  await fp.getByRole('link', { name: 'Founder: review referrals and rewards' }).click()
  const rq = fp.getByTestId('referral-queue')
  await rq.waitFor()
  check('the referral waits in the queue with whom they first followed', flat(await rq.innerText()).includes(`@${user('i')} referred @${user('o')}, whose first follow was @${user('g')}`))
  await rq.getByRole('button', { name: `Approve referral by ${user('i')}` }).click()
  await fp.waitForFunction((t) => !document.body.innerText.includes(t), `@${user('i')} referred`)
  check('approved: Ria\'s 100 points are redeemable', sql(`select sim.award_state(id) from sim.points_ledger where member_id = '${ria}' and action = 'qualified_referral' and reverses is null`) === 'approved')
  const month = sql("select to_char(m, 'YYYY-MM') from generate_series(date_trunc('month', now()) - interval '1 month', date_trunc('month', now()) - interval '60 months', interval '-1 month') m where not exists (select 1 from sim.settlements s where s.month = m::date) limit 1")
  await fp.getByLabel('Month').fill(month)
  await fp.getByLabel('Creator username').fill(user('g'))
  await fp.getByLabel('Net amount ($)').fill('100')
  await fp.getByLabel('Note').fill('Founder journey: content campaign')
  await fp.getByRole('button', { name: 'Record simulated revenue' }).click()
  await fp.getByText(`Recorded $100.00 of simulated content advertising for ${month}.`).waitFor()
  const o8 = flat(await fp.getByTestId('rewards-overview').innerText())
  check('the reconciliation adds up: creators + fan pool + Splitpost = revenue',
    sql('select sum(net_cents) = sum((sim.split(kind, net_cents)).creator_cents + (sim.split(kind, net_cents)).pool_cents + (sim.split(kind, net_cents)).splitpost_cents) from sim.revenue_entries') === 't', o8)
  await screenChecks(fp, 'the founder rewards page')
  const pool = Number(sql('select sim.open_pool_cents()'))
  const outstanding = sql('select coalesce(sum(points), 0) || \'|\' || count(*) from sim.outstanding()').split('|')
  const dollars = (c) => `$${(c / 100).toFixed(2)}`
  await fp.getByLabel('Month').fill(month)
  await fp.getByRole('button', { name: 'Close the month (simulated)' }).click()
  await fp.getByText(`Closed ${month}: ${dollars(pool)} of a ${dollars(pool)} pool to ${outstanding[1]} members (${outstanding[0]} points). It reconciles to the cent.`).waitFor()
  check('the closed month allocates the whole open pool to the approved points', pool > 0 && Number(outstanding[0]) >= 100)
  check('the settlement lines equal the pool to the cent, in the database',
    sql(`select (select sum(value_cents) from sim.settlement_lines l join sim.settlements s on s.id = l.settlement_id where s.month = '${month}-01') = (select pool_cents from sim.settlements where month = '${month}-01')`) === 't')
  check('Ria\'s points are settled in the close', sql(`select count(*) from sim.settlement_lines l join sim.settlements s on s.id = l.settlement_id where s.month = '${month}-01' and l.member_id = '${ria}'`) === '1')
  await fp.getByRole('button', { name: 'Close the month (simulated)' }).click()
  await fp.getByText('That month is already closed.').waitFor()
  check('a month closes only once', sql(`select count(*) from sim.settlements where month = '${month}-01'`) === '1')

  // ---------------------------------------------------------------------------
  step('9. Privacy: a deletion request, confirmed by typing the username')
  await rpc(tD, 'app_submit_member_request', { p_kind: 'deletion', p_details: 'Please delete my account.' })
  const others = () => sql(`select coalesce(string_agg(member_id || ':' || s, ',' order by member_id), '') from (select member_id, sum(points) s from sim.points_ledger where member_id is not null and member_id <> '${dee}' group by member_id) x`)
  const before = others()
  await fp.goto(`${APP}/app/control`)
  await privacy.waitFor()
  const req = privacy.getByRole('listitem').filter({ hasText: `@${user('d')}` })
  await req.waitFor()
  check('the request is listed as an open account deletion', flat(await req.innerText()).includes(`Delete account · @${user('d')}`) && /open/.test(await req.innerText()))
  await req.getByLabel('Type the username to confirm').fill('someone-else')
  await req.getByRole('button', { name: 'Delete this account' }).click()
  await req.getByText('Type the confirmation exactly as shown.').waitFor()
  check('a wrong username is refused and nothing is deleted', sql(`select count(*) from auth.users where id = '${dee}'`) === '1')
  await req.getByLabel('Type the username to confirm').fill(user('d'))
  await req.getByRole('button', { name: 'Delete this account' }).click()
  await privacy.getByText('Deleted. 1 posts removed, 1 simulated awards forfeited.').waitFor()
  check('the account, its posts and its follows are gone', sql(`select (select count(*) from auth.users where id = '${dee}') + (select count(*) from social.posts where author_id = '${dee}') + (select count(*) from social.follows where follower_id = '${dee}' or creator_id = '${dee}')`) === '0')
  check('the deletion is recorded in the request history', sql(`select action from ops.member_request_events e join ops.member_requests r on r.id = e.request_id where r.kind = 'deletion' order by e.id desc limit 1`) === 'account_deleted')
  check('My Split totals for everyone else are unchanged', others() === before)
  check('every closed month still reconciles', sql('select bool_and(s.pool_cents = coalesce((select sum(value_cents) from sim.settlement_lines l where l.settlement_id = s.id), 0) or s.points = 0) from sim.settlements s') === 't')

  // ---------------------------------------------------------------------------
  step('10. Intelligence: the North Star and figures match the database, test data apart')
  await fp.reload()
  await fp.getByTestId('control-center').waitFor()
  const ns = await fp.getByTestId('north-star').innerText()
  const db = sql(`select count(*) filter (where not test) || ',' || count(*) filter (where test) from ops.connections(${week}, now())`).split(',')
  check('the North Star matches the database, with test accounts excluded', ns.trim() === db[0] && Number(db[0]) >= 1, `${ns} vs ${db}`)
  const cc = flat(await fp.getByTestId('control-center').innerText())
  check('test-data connections are counted apart', cc.includes(`${db[1]} test-data connections excluded`) && Number(db[1]) >= 1, cc.slice(0, 200))
  const testMembers = sql("select count(*) from ops.member_access where status = 'active' and cohort = 'tester'")
  check('test accounts are counted apart and labelled Test data', cc.includes(`Test accounts Test data ${testMembers} Excluded from every actual figure`), cc)
  const main = flat(await fp.locator('main').innerText())
  check('simulated money is labelled Simulated, and hypotheses as hypotheses', /Fan pool Simulated/.test(main) && /Business hypotheses Hypothesis Not validated/.test(main))
  check('the Control Center names no member', ![...['g', 'r', 'v', 'p', 'o', 'i'].map((k) => user(k)), 'Vi Viewer', 'Pat Parent', 'Rob Referred', 'Rex Rude'].some((x) => cc.includes(x)))
  const dl = fp.waitForEvent('download')
  await fp.getByRole('button', { name: 'Export CSV' }).click()
  const csv = readFileSync(await (await dl).path(), 'utf8').split('\n')
  check('the export labels every row actual, simulated, test or hypothesis', csv[0] === 'section,metric,value,kind' && csv.slice(1).every((l) => /,(actual|simulated|test|hypothesis)$/.test(l)))
  check('the export carries the same North Star', csv.some((l) => l === `north_star,connections ${sql(`select to_char(${week}, 'YYYY-MM-DD')`)},${db[0]},actual`))
  await screenChecks(fp, 'the Control Center at the end of the day')
  await fay.ctx.close()
  sql("select ops.set_registration_settings('stakeholder-founder', 'journey: done', true)")
})
