// Stakeholder journey 3: the ADVERTISER, who is an ordinary member (one
// account, no separate sign-up), as one continuous story through the real UI,
// in a real browser against a LOCAL Supabase with the production security
// headers. It crosses the engines an advertiser touches: the unified account,
// managed advertising (request, review, campaign), matching by declared
// preference, the member's ad controls, and aggregate reporting.
//
//  1. Ada, a member, opens Profile, "Advertise with Splitpost" and sends her
//     request; while it waits, a second request is not possible.
//  2. The founder sees "Requested by @ada" on Advertising, approves it, and
//     creates and activates a campaign (managed onboarding).
//  3. Cy, who chose the category in her ad preferences, sees the ad under a
//     creator's post, labelled Sponsored, and Why this ad names her choice.
//  4. Ada sees her approved request, her campaign and its aggregate report:
//     the figures match the database, groups under 10 are withheld and no
//     member is named.
// WCAG 2.2 AA at 320 and 390 px on key screens, no sideways scrolling, no CSP
// violations. Run by scripts/e2e/auth-journey.sh.
const { journey } = require('./lib/stakeholder.cjs')

const J = journey('Advertiser journey', 'Advertiser-Journey-42-pass')
const { APP, RUN, flat, check, step, sql, sqlEventually, screenChecks, person, createMember, tokenFor, rpc, founderAccount, signIn, nav } = J

J.run(async (browser) => {
  const email = (k) => `sa-${k}-${RUN}@example.test`
  const userA = `saa${RUN}`
  const userCy = `sac${RUN}`
  const business = `Happy Paws ${RUN}`
  const campaign = `Autumn treats ${RUN}`
  const headline = `Healthy treats your dog will love ${RUN}`
  const a = await createMember(email('a'), userA, 'Ada Advertiser')
  const cy = await createMember(email('c'), userCy, 'Cy Consumer')
  await createMember(email('p'), `sap${RUN}`, 'Pip Poster')
  const founder = await founderAccount()
  const tP = await tokenFor(email('p'))
  const post = (await rpc(tP, 'app_create_post', { p_body: `Sunday roast for the whole family ${RUN}` })).body
  await rpc(tP, 'app_set_post_topic', { p_post: post, p_topic: 'food' })

  // ---------------------------------------------------------------------------
  step('1. Ada, an ordinary member, asks to advertise from her own account')
  const ada = await person(browser)
  await signIn(ada.page, email('a'))
  await nav(ada.page).getByTitle('Profile').click()
  await ada.page.getByRole('link', { name: 'Advertise with Splitpost' }).click()
  await ada.page.getByRole('heading', { name: 'Advertise with Splitpost' }).waitFor()
  check('advertising needs no new account: the same member, same sign-in', (await ada.page.getByText('Same account, nothing new to sign up for.').count()) === 1)
  await ada.page.getByLabel('Business name').fill(business)
  await ada.page.getByLabel('Website', { exact: true }).fill('https://happypaws.example')
  await ada.page.getByLabel('What do you offer?').fill('Natural dog treats, delivered monthly')
  await ada.page.getByLabel('What problem does it solve?').fill('Most treats are full of fillers')
  await ada.page.getByLabel('What do your customers need?').fill('Dog owners who want simple ingredients')
  await ada.page.getByLabel('What outcome do you want for them?').fill('A healthier, happier dog')
  await ada.page.getByLabel('Your main goal').selectOption('sales')
  await ada.page.getByLabel('What should people do after seeing your ad?').fill('Order a first box')
  await ada.page.getByRole('button', { name: 'Pets', exact: true }).click()
  check('the category is chosen', (await ada.page.getByRole('button', { name: 'Pets', exact: true }).getAttribute('aria-pressed')) === 'true')
  await screenChecks(ada.page, 'the advertising request form')
  await ada.page.getByRole('button', { name: 'Send my request' }).click()
  await ada.page.getByText('Thanks. Your request is with the Splitpost team.', { exact: false }).waitFor()
  const reqs = flat(await ada.page.getByRole('heading', { name: 'Your requests' }).locator('..').innerText())
  check('her request shows "Waiting for review"', reqs.includes(business) && reqs.includes('Waiting for review'), reqs)
  check('the request is stored as a pending advertiser, requested by Ada, with every answer',
    sql(`select status || '|' || objective || '|' || array_to_string(categories, ',') || '|' || (requested_by = '${a}') || '|' || (offering <> '' and problem_solved <> '' and customer_needs <> '' and desired_outcome <> '' and conversion_action <> '') from ads.advertisers where name = '${business}'`) === 'pending|sales|pets|true|true')
  check('while it waits, the form is not offered again', (await ada.page.getByRole('button', { name: 'Send my request' }).count()) === 0)
  const second = await rpc(await tokenFor(email('a')), 'app_request_advertising', { p: { name: `${business} again`, website: 'https://happypaws.example', offering: 'x', problem_solved: 'x', desired_outcome: 'x', customer_needs: 'x', objective: 'sales', conversion_action: 'x', categories: ['pets'] } })
  check('a second request is refused while one is open', second.status >= 400 && /request_pending/.test(JSON.stringify(second.body)))
  check('nothing about advertising changed what Ada can do as a member', sql(`select cohort || '|' || status from ops.member_access where user_id = '${a}'`) === 'tester|active')
  await screenChecks(ada.page, 'Advertise with Splitpost, waiting for review')

  // ---------------------------------------------------------------------------
  step('2. The founder reviews the request, approves it, and creates and activates a campaign')
  const fay = await person(browser)
  await signIn(fay.page, founder.email)
  await nav(fay.page).getByTitle('Profile').click()
  await fay.page.getByRole('link', { name: 'Advertising', exact: true }).click()
  await fay.page.getByRole('heading', { name: 'Advertising', exact: true }).waitFor()
  const adv = fay.page.getByRole('list', { name: 'Advertisers' }).getByRole('listitem').filter({ hasText: business })
  await adv.waitFor()
  const tAdv = flat(await adv.innerText())
  check('Advertising shows "Requested by @ada from their account", with her answers', tAdv.includes(`Requested by @${userA} from their account`) && tAdv.includes('Natural dog treats') && /pending/i.test(tAdv), tAdv)
  await adv.getByRole('checkbox', { name: `${business}` }).check()
  await adv.getByRole('button', { name: `Approve ${business}` }).click()
  await adv.getByText('approved').waitFor()
  check('the request is approved and recorded with who reviewed it', sql(`select status || '|' || (reviewed_at is not null) from ads.advertisers where name = '${business}'`) === 'approved|true')
  await fay.page.getByLabel('Advertiser (approved)').selectOption({ label: business })
  await fay.page.getByLabel('Campaign name').fill(campaign)
  await fay.page.getByLabel('Headline').fill(headline)
  await fay.page.getByLabel('Text').fill('Simple ingredients, delivered every month.')
  await fay.page.getByLabel('Button label').fill('Order a box')
  await fay.page.getByLabel('Landing page').fill('https://happypaws.example/box')
  await fay.page.getByLabel('Simulated price ($)').fill('80')
  await fay.page.getByRole('group', { name: 'Commercial categories (from onboarding)' }).getByLabel('Pets').check()
  await fay.page.getByRole('button', { name: 'Save campaign (as draft)' }).click()
  await fay.page.getByRole('button', { name: `Activate ${campaign}` }).click()
  await fay.page.getByRole('button', { name: `Pause ${campaign}` }).waitFor()
  check('the campaign is active, for the approved advertiser, in the Pets category',
    sql(`select c.status || '|' || array_to_string(c.categories, ',') || '|' || a.status from ads.campaigns c join ads.advertisers a on a.id = c.advertiser_id where c.name = '${campaign}'`) === 'active|pets|approved')
  await screenChecks(fay.page, 'the founder advertising page')
  await fay.ctx.close()

  // ---------------------------------------------------------------------------
  step('3. Cy chose Pets in her ad preferences and sees the ad, labelled Sponsored')
  const cyp = await person(browser)
  await signIn(cyp.page, email('c'))
  await nav(cyp.page).getByTitle('Profile').click()
  const prefs = cyp.page.getByTestId('ad-preferences')
  await prefs.waitFor()
  await prefs.getByLabel('Pets').selectOption('chosen')
  check('her choice is saved as an ad preference, apart from her content interests',
    await sqlEventually(`select count(*) from ads.preferences where member_id = '${cy}' and category = 'pets'`, '1') === '1' && sql(`select count(*) from social.member_topics where user_id = '${cy}'`) === '0')
  await cyp.page.goto(`${APP}/app/post/${post}`)
  const card = cyp.page.getByTestId('ad')
  await card.waitFor()
  const tCard = flat(await card.innerText())
  check('the ad is labelled Sponsored and says which creator\'s post it is shown with', tCard.toLowerCase().includes("sponsored · shown with pip poster's post"), tCard)
  check('the ad is the advertiser\'s campaign', tCard.includes(headline) && tCard.includes(business), tCard)
  await card.getByRole('button', { name: 'Why this ad' }).click()
  check('Why this ad names the category Cy chose', (await card.getByTestId('why-this-ad').innerText()).includes('You chose "Pets"'))
  await screenChecks(cyp.page, 'a post with the sponsored ad')
  const imp = sql(`select i.id from ads.impressions i join ads.campaigns c on c.id = i.campaign_id where c.name = '${campaign}' and i.member_id = '${cy}'`)
  check('one impression is recorded, matched by her preference', !!imp && sql(`select match from ads.impressions where id = '${imp}'`) === 'preference')
  check('the visible ad counts as a valid impression', await sqlEventually(`select (viewed_at is not null)::text from ads.impressions where id = '${imp}'`, 'true') === 'true')
  check('seeing an ad earns no Connection Points', sql(`select count(*) from sim.points_ledger where member_id = '${cy}'`) === '0')
  await cyp.ctx.close()

  // ---------------------------------------------------------------------------
  step('4. Ada sees her campaign and an aggregate report, with small groups withheld')
  await ada.page.reload()
  await ada.page.getByRole('heading', { name: 'Your campaigns' }).waitFor()
  const reqs4 = flat(await ada.page.getByRole('heading', { name: 'Your requests' }).locator('..').innerText())
  check('her request now shows Approved', reqs4.includes('Approved'), reqs4)
  const mine = ada.page.getByRole('heading', { name: 'Your campaigns' }).locator('..').getByRole('listitem').filter({ hasText: campaign })
  check('her campaign is listed as active', /active/.test(await mine.innerText()))
  check('she sees only her own campaigns', sql(`select count(*) from ads.campaigns c join ads.advertisers v on v.id = c.advertiser_id where v.requested_by = '${a}'`) === String(await ada.page.getByRole('heading', { name: 'Your campaigns' }).locator('..').getByRole('listitem').count()))
  check('the form to send another request is offered again once reviewed', (await ada.page.getByRole('button', { name: 'Send my request' }).count()) === 1)
  await mine.getByRole('button', { name: 'See report' }).click()
  const rep = ada.page.getByTestId('my-campaign-report')
  await rep.waitFor()
  await rep.locator('dl').waitFor()
  const t4 = flat(await rep.innerText())
  const dbImp = sql(`select count(*) from ads.impressions i join ads.campaigns c on c.id = i.campaign_id where c.name = '${campaign}' and i.viewed_at is not null`)
  // Every member count under 10 is withheld from the advertiser (release hardening), including impressions and clicks.
  check('the database has the one valid impression, and the advertiser sees it withheld as "fewer than 10"', dbImp === '1' && /Valid impressions Actual fewer than 10/.test(t4) && /Clicks to your site Actual fewer than 10/.test(t4), `${dbImp}: ${t4}`)
  check('the report explains that figures stay hidden until 10 people have seen the ad', t4.includes('Figures stay hidden until at least 10 people have seen it'), t4)
  check('the audience and reach under 10 are withheld ("fewer than 10")', /Members who chose your category Actual fewer than 10/.test(t4) && /People reached Actual fewer than 10/.test(t4), t4)
  check('the report separates delivery by preference, withheld under 10', /Shown because members chose your category fewer than 10/.test(t4), t4)
  check('the report names no member', !t4.includes('Cy Consumer') && !t4.includes(userCy) && !t4.includes(cy))
  check('the report says totals only, with groups under 10 never shown', t4.includes('Totals only. Groups under 10 people are never shown, and nothing identifies a member.'))
  await screenChecks(ada.page, 'the advertiser\'s own report')
  await ada.ctx.close()
})
