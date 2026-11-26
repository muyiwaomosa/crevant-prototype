// Stakeholder journey 2: the CONSUMER (a fan), as one continuous story through
// the real UI, in a real browser against a LOCAL Supabase with real Auth, real
// email (Mailpit) and the production security headers. It crosses the engines
// a fan touches: registration and onboarding, discovery, relationships (follows
// and the Clique), content, contributions and referrals, and the simulated
// rewards model in My Split.
//
//  1. Kai registers through an invitation link and confirms his email.
//  2. Setup: "Find creators I'll love", his interests; the suggestions put the
//     creator who shares his interests first; he follows her and joins her Clique.
//  3. Discover: For you shows a post in his interests from someone he doesn't
//     follow, with its reason; Creators by interest finds that creator; he follows.
//  4. His Clique: he adds the second creator from Following.
//  5. He consumes: Home puts his Clique first; he opens a post.
//  6. He contributes: a thoughtful comment, a save, a repost and a share earn
//     Connection Points (a like earns nothing), checked against the ledger.
//  7. He refers Lu with his personal link; Lu joins, and her own first follow
//     makes it a qualified referral waiting for review.
//  8. My Split: recognized versus waiting for review, "How My Split works",
//     every value labelled Simulated, nothing paid; History lists each entry.
// WCAG 2.2 AA at 320 and 390 px on key screens, no sideways scrolling, no CSP
// violations. Run by scripts/e2e/auth-journey.sh.
const { journey } = require('./lib/stakeholder.cjs')

const J = journey('Consumer journey', 'Consumer-Journey-42-pass')
const { APP, RUN, flat, check, step, sql, sqlEventually, screenChecks, person, createMember, tokenFor, rpc, registerThrough, nameStep, topicButton, idOf, nav } = J

J.run(async (browser) => {
  const email = (k) => `sk-${k}-${RUN}@example.test`
  const userK = `skk${RUN}`
  const userL = `skl${RUN}`
  sql("select ops.set_registration_settings('stakeholder-consumer', 'journey: open', false, 200, 25, 5)")
  const invite = sql("select ops.create_invitation_link('stakeholder-consumer', 'fan', 1)")

  // The creators Kai will find: Ola (food and travel), Bo (travel) and Max (money).
  const creators = {}
  for (const [k, name, topics, follow, posts] of [
    ['m', 'Max Money', ['money'], null, [['money', `Index funds in plain words ${RUN}`]]],
    ['b', 'Bo Travels', ['travel'], 'Cheap weekend trips, tested.', [['travel', `Three days in Lisbon on a budget ${RUN}`]]],
    ['o', 'Ola Cooks', ['food', 'travel'], 'Street food from everywhere, at home.', [['food', `Ten-minute noodles from Bangkok ${RUN}`], ['food', `My spice cupboard, explained ${RUN}`]]],
  ]) {
    const id = await createMember(email(k), `sk${k}${RUN}`, name)
    const t = await tokenFor(email(k))
    await rpc(t, 'app_set_creator_topics', { p_topics: topics })
    if (follow) await rpc(t, 'app_set_profile_details', { p_identity: 'creator', p_bio: null, p_follow_reason: follow, p_topics: topics })
    const ids = []
    for (const [topic, body] of posts) {
      const p = (await rpc(t, 'app_create_post', { p_body: body })).body
      await rpc(t, 'app_set_post_topic', { p_post: p, p_topic: topic })
      ids.push(p)
    }
    creators[k] = { id, name, username: `sk${k}${RUN}`, posts: ids, text: posts.map((p) => p[1]) }
  }
  const { o: ola, b: bo, m: max } = creators

  // ---------------------------------------------------------------------------
  step('1. Kai registers through an invitation link')
  const kai = await person(browser)
  await kai.ctx.grantPermissions(['clipboard-read', 'clipboard-write'])
  await registerThrough(kai.page, `${APP}/register/${invite}`, email('k'))
  const k = idOf(email('k'))
  check('Kai joins as a fan through the invitation', sql(`select cohort || '|' || status from ops.member_access where user_id = '${k}'`) === 'fan|active')

  // ---------------------------------------------------------------------------
  step('2. Setup: his interests, relevant suggestions, an intentional follow and his Clique')
  await nameStep(kai.page, userK, 'Kai Fan')
  await kai.page.getByRole('radio', { name: /Find creators I'll love/ }).check()
  await kai.page.getByRole('button', { name: 'Continue', exact: true }).click()
  await kai.page.getByRole('heading', { name: 'What are you into?' }).waitFor()
  await topicButton(kai.page, 'Food & cooking').click()
  await topicButton(kai.page, 'Travel').click()
  check('the interest picker nudges toward three', (await kai.page.getByTestId('topic-progress').innerText()) === '2 chosen. Pick 1 more for better suggestions.')
  await screenChecks(kai.page, 'setup, your interests')
  await kai.page.getByRole('button', { name: 'Continue', exact: true }).click()
  await kai.page.getByRole('button', { name: 'Save and continue' }).click()
  await kai.page.getByRole('heading', { name: 'People you might like' }).waitFor()
  const suggested = kai.page.getByTestId('suggested-people').getByRole('listitem')
  await suggested.first().waitFor()
  const first = flat(await suggested.first().innerText())
  check('the first suggestion is the creator who shares both his interests, with why to follow', first.includes('Ola Cooks') && first.includes('Shares 2 of your interests') && first.includes('Why follow'), first)
  const names = await suggested.allInnerTexts()
  const iMax = names.findIndex((t) => t.includes('Max Money'))
  check('a creator outside his interests is not ranked above her', iMax === -1 || iMax > 0)
  check('nothing was followed for him', sql(`select count(*) from social.follows where follower_id = '${k}'`) === '0')
  await screenChecks(kai.page, 'setup, people you might like')
  const olaCard = suggested.filter({ hasText: 'Ola Cooks' }).first()
  await olaCard.getByRole('button', { name: 'Follow Ola Cooks' }).click()
  await olaCard.getByTestId('follow-confirmation').getByRole('button', { name: 'Join Clique (Ola Cooks)' }).click()
  await olaCard.getByRole('button', { name: 'In your Clique (Ola Cooks, tap to remove)' }).waitFor()
  check('he follows Ola from the suggestions, and she is in his Clique',
    sql(`select e.source || '|' || (select count(*) from social.clique_members c where c.fan_id = e.follower_id and c.creator_id = e.creator_id and c.removed_at is null) from social.follow_events e where e.follower_id = '${k}' and e.creator_id = '${ola.id}' and e.action = 'followed'`) === 'discover|1')
  await kai.page.getByRole('button', { name: 'Continue', exact: true }).click()
  await kai.page.getByRole('heading', { name: 'How My Split works' }).waitFor()
  await kai.page.getByRole('button', { name: 'Go to my feed' }).click()
  await kai.page.getByRole('heading', { name: 'Home' }).waitFor()

  // ---------------------------------------------------------------------------
  step('3. Discover: posts in his interests with their reason, and creators by interest')
  await nav(kai.page).getByTitle('Discover').click()
  await kai.page.getByRole('tab', { name: 'For you' }).waitFor()
  const boPost = kai.page.getByRole('listitem').filter({ hasText: bo.text[0] })
  await boPost.first().waitFor()
  const reason = flat(await boPost.first().getByTestId('discover-reason').innerText())
  check('For you shows Bo\'s travel post, from someone he doesn\'t follow, with its reason', /Travel/.test(reason), reason)
  check('For you leaves out the creator he already follows', (await kai.page.getByRole('listitem').filter({ hasText: ola.text[0] }).count()) === 0)
  await screenChecks(kai.page, 'Discover, For you')
  await kai.page.getByRole('tab', { name: 'Creators' }).click()
  await kai.page.getByLabel('Browse by interest').selectOption('travel')
  const boCard = kai.page.getByRole('listitem').filter({ hasText: 'Bo Travels' }).first()
  await boCard.waitFor()
  check('Creators by interest shows Bo with what he posts about', (await boCard.innerText()).includes('Travel'))
  await screenChecks(kai.page, 'Discover, Creators')
  await boCard.getByRole('button', { name: 'Follow Bo Travels' }).click()
  await boCard.getByTestId('follow-confirmation').waitFor()
  check('he follows Bo intentionally, from Discover', sql(`select source from social.follow_events where follower_id = '${k}' and creator_id = '${bo.id}' and action = 'followed'`) === 'discover')

  // ---------------------------------------------------------------------------
  step('4. His Clique: he adds Bo from Following')
  await kai.page.goto(`${APP}/app/clique`)
  const following = kai.page.getByRole('region', { name: 'Following' })
  await following.getByRole('button', { name: 'Join Clique (Bo Travels)' }).click()
  await kai.page.getByText('2 in your Clique').waitFor()
  check('his Clique has both creators', sql(`select count(*) from social.clique_members where fan_id = '${k}' and removed_at is null`) === '2')
  check('he follows exactly the two creators he chose', sql(`select count(*) from social.follows where follower_id = '${k}'`) === '2')
  await screenChecks(kai.page, 'Your Clique')

  // ---------------------------------------------------------------------------
  step('5. He consumes: Home puts his Clique first, and he opens a post')
  await nav(kai.page).getByTitle('Home').click()
  await kai.page.getByRole('region', { name: 'Your Clique' }).waitFor()
  const feed = kai.page.getByTestId('post')
  await feed.first().waitFor()
  const top = await feed.first().innerText()
  check('Home shows his Clique\'s posts', [ola.text[1], ola.text[0], bo.text[0]].some((t) => top.includes(t)), flat(top).slice(0, 120))
  check('a creator he doesn\'t follow is not in his Home', (await kai.page.getByText(max.text[0]).count()) === 0)
  await screenChecks(kai.page, 'Home, Clique first')
  await feed.filter({ hasText: ola.text[0] }).first().getByRole('link', { name: '0 comments' }).click()
  await kai.page.waitForURL(`${APP}/app/post/${ola.posts[0]}`)
  check('opening the post is recorded once', await sqlEventually(`select count(*) from social.post_opens where viewer_id = '${k}' and post_id = '${ola.posts[0]}'`, '1') === '1')

  // ---------------------------------------------------------------------------
  step('6. He contributes: comment, save, repost, share (and a like earns nothing)')
  const pts = () => sql(`select coalesce(sum(points), 0) from sim.points_ledger where member_id = '${k}'`)
  await kai.page.getByRole('button', { name: /^Like, / }).first().click()
  await kai.page.getByRole('button', { name: /^Unlike, / }).first().waitFor()
  check('a like earns no Connection Points', await sqlEventually(`select count(*) from social.likes where user_id = '${k}'`, '1') === '1' && pts() === '0')
  await kai.page.getByLabel('Write a comment').fill('I made these last night and added peanuts, so good. Thanks for the clear steps!')
  await kai.page.getByRole('button', { name: 'Comment' }).click()
  await kai.page.getByTestId('comment').filter({ hasText: 'added peanuts' }).waitFor()
  await kai.page.getByRole('button', { name: 'Save', exact: true }).first().click()
  await kai.page.getByRole('button', { name: 'Saved (tap to remove)' }).first().waitFor()
  await kai.page.getByRole('button', { name: 'Share', exact: true }).first().click()
  await kai.page.getByRole('button', { name: 'Link copied' }).first().waitFor()
  const shared = await kai.page.evaluate(() => navigator.clipboard.readText())
  check('the shared link is the post preview carrying his referral code', shared.startsWith(`${APP}/p/${ola.posts[0]}?r=`))
  await screenChecks(kai.page, 'a post after commenting, saving and sharing')
  await kai.page.goto(`${APP}/app/post/${bo.posts[0]}`)
  await kai.page.getByRole('button', { name: 'Repost, 0 reposts' }).click()
  await kai.page.getByRole('button', { name: 'Undo repost, 1 repost' }).waitFor()
  check('comment 2 + save 2 + share 5 + repost 5 = 14 recognized points in the ledger', (await sqlEventually(`select coalesce(sum(points), 0) from sim.points_ledger where member_id = '${k}'`, '14')) === '14', pts())
  check('each contribution is credited to the creator it helped',
    sql(`select string_agg(l.action || ':' || p.username, ',' order by l.action) from sim.points_ledger l join public.profiles p on p.id = l.creator_id where l.member_id = '${k}'`)
      === `external_share:${ola.username},meaningful_comment:${ola.username},repost:${bo.username},save:${ola.username}`)
  check('his contributions are recognized, not redeemable', sql(`select bool_and(not redeemable and status = 'recognized') from sim.points_ledger where member_id = '${k}'`) === 't')

  // ---------------------------------------------------------------------------
  step('7. He refers Lu with his personal link; her own first follow qualifies it')
  await nav(kai.page).getByTitle('My Split').click()
  await kai.page.getByRole('tab', { name: 'Opportunities' }).click()
  const refLink = await kai.page.getByTestId('referral-link').innerText()
  check('Opportunities shows his personal link', /\/register\/[0-9a-f]{16}$/.test(refLink) && refLink.startsWith(`${APP}/register/`))
  await kai.page.getByRole('button', { name: 'Copy link' }).click()
  await kai.page.getByRole('button', { name: 'Copied' }).waitFor()
  check('Copy link copies the same link', (await kai.page.evaluate(() => navigator.clipboard.readText())) === refLink)
  await screenChecks(kai.page, 'My Split, Opportunities')
  const lu = await person(browser)
  await registerThrough(lu.page, refLink, email('l'))
  const l = idOf(email('l'))
  check('Lu is attributed to Kai, as a fan', sql(`select r.kind || '|' || r.referrer_id || '|' || a.cohort from ops.registrations r join ops.member_access a on a.user_id = r.user_id where r.user_id = '${l}'`) === `referral|${k}|fan`)
  await nameStep(lu.page, userL, 'Lu Referred')
  await lu.page.getByRole('button', { name: 'Skip the rest' }).click()
  const inviter = lu.page.getByTestId('inviter-card')
  await inviter.waitFor()
  check('Lu sees she is here because of Kai', flat(await inviter.innerText()).includes("You're here because of Kai Fan"))
  await inviter.getByRole('button', { name: 'Not now' }).click()
  await inviter.getByText('No problem. You can follow them from their profile any time.').waitFor()
  check('joining alone earns Kai nothing: no follow, no referral yet', sql(`select count(*) from social.follows where follower_id = '${l}'`) === '0' && sql(`select count(*) from sim.points_ledger where member_id = '${k}' and action = 'qualified_referral'`) === '0')
  await lu.page.getByRole('button', { name: 'Continue', exact: true }).click()
  await lu.page.getByRole('button', { name: 'Go to my feed' }).click()
  await lu.page.goto(`${APP}/app/u/${ola.username}`)
  await lu.page.getByRole('button', { name: 'Follow Ola Cooks' }).click()
  await lu.page.getByTestId('follow-confirmation').waitFor()
  check('Lu\'s own first follow makes Kai\'s referral qualified, waiting for review (100)',
    await sqlEventually(`select string_agg(points || ':' || status, ',') from sim.points_ledger where member_id = '${k}' and action = 'qualified_referral'`, '100:pending_review') === '100:pending_review')
  await lu.ctx.close()

  // ---------------------------------------------------------------------------
  step('8. My Split: recognized versus waiting for review, how it works, all simulated')
  await kai.page.goto(`${APP}/app/split`)
  const box = kai.page.getByTestId('split-points')
  await box.waitFor()
  const t8 = flat(await box.innerText())
  check('Recognized 14, marked not redeemable', /Recognized 14 Counts your contribution\. Not redeemable\./.test(t8), t8)
  check('Redeemable 0, with 100 waiting for review', /Redeemable 0 From qualified referrals\. 100 waiting for review\./.test(t8), t8)
  check('the estimated value is labelled Simulated and is $0.00 until review', /Estimated value of your redeemable points Simulated \$0\.00/.test(t8), t8)
  check('the disclosure: simulated, no cash value, nothing paid out', /simulated.*no cash value.*nothing is paid out/i.test(await kai.page.getByTestId('split-disclosure').innerText()))
  const week = flat(await kai.page.getByTestId('contribution-insight').innerText())
  check('Your week: what happened, what it means, what to do next, and the referral waiting', /What happened.*What it means.*What to do next/i.test(week) && week.includes('Referrals: 1 joined · 1 waiting for review · 0 qualified'), week)
  const intro = kai.page.getByTestId('my-split-intro')
  await intro.waitFor()
  const ti = flat(await intro.innerText())
  check('"How My Split works" is in My Split: recognized, redeemable after review, simulated, nothing paid', /Connection Points/.test(ti) && /redeemable after a quick review/.test(ti) && /nothing is paid/.test(ti), ti)
  const all = flat(await kai.page.locator('main').innerText())
  check('My Split shows no allocation percentages', !/\d+\s*%/.test(all))
  await screenChecks(kai.page, 'My Split, Overview')
  await kai.page.getByRole('tab', { name: 'History' }).click()
  const hist = kai.page.getByTestId('points-history')
  await hist.waitFor()
  const h = flat(await hist.innerText())
  check('History lists each contribution with the creator', ['Thoughtful comment', 'Saved a post', 'Reposted', 'Shared outside Splitpost', 'Ola Cooks', 'Bo Travels'].every((x) => h.includes(x)), h)
  check('History shows the referral waiting for review', /Qualified referral/.test(h), h)
  await screenChecks(kai.page, 'My Split, History')
  check('nothing is paid: the only money is in the simulated schema', sql("select count(*) from pg_namespace where nspname = 'finance'") === '0')

  await kai.ctx.close()
  sql("select ops.set_registration_settings('stakeholder-consumer', 'journey: done', true)")
})
