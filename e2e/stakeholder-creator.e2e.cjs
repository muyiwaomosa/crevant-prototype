// Stakeholder journey 1: the CREATOR, as one continuous story through the real
// UI, in a real browser against a LOCAL Supabase with real Auth, real email
// (Mailpit) and the production security headers. It crosses the engines a
// creator touches: registration and onboarding, content, relationships
// (follows and the Clique), invitations and referrals, intelligence, and the
// simulated money model.
//
//  1. Cleo registers through a founder invitation link and confirms her email.
//  2. Setup: she chooses "Share my own work", her interests and a bio, and
//     learns how My Split works; "Set up my creator profile" takes her to Profile.
//  3. Creator setup on Profile: up to 3 posting topics (a fourth is not
//     possible, in the page or in the database).
//  4. Her first post: the first-post guide shows before it, then not again.
//  5. She copies her personal invitation link.
//  6. Nia registers through that link, sees "You're here because of" Cleo,
//     and follows her by choice; she joins Cleo's Clique, opens and comments.
//  7. Cleo strengthens the relationship: she sees who joined, follows Nia back
//     and adds her to her own Clique.
//  8. Attention, Retention and Money faces reflect the new follower, checked
//     against the database.
//  9. Simulated earnings: the founder records simulated content revenue; Cleo's
//     Money face shows her share labelled Simulated, actual income $0.00, and
//     no allocation percentages.
// WCAG 2.2 AA at 320 and 390 px on key screens, no sideways scrolling, no CSP
// violations. Run by scripts/e2e/auth-journey.sh.
const { journey } = require('./lib/stakeholder.cjs')

const J = journey('Creator journey', 'Creator-Journey-42-pass')
const { APP, RUN, flat, check, step, sql, sqlEventually, screenChecks, person, createMember, tokenFor, rpc, founderAccount, signIn, registerThrough, nameStep, topicButton, idOf, nav } = J

J.run(async (browser) => {
  const emailC = `sc-c-${RUN}@example.test`
  const emailN = `sc-n-${RUN}@example.test`
  const userC = `scc${RUN}`
  const userN = `scn${RUN}`
  sql("select ops.set_registration_settings('stakeholder-creator', 'journey: open', false, 200, 25, 5)")
  const invite = sql("select ops.create_invitation_link('stakeholder-creator', 'creator', 1)")
  const founder = await founderAccount()

  // ---------------------------------------------------------------------------
  step('1. Cleo registers through a founder invitation link')
  const cleo = await person(browser)
  await cleo.ctx.grantPermissions(['clipboard-read', 'clipboard-write'])
  await cleo.page.goto(`${APP}/register/${invite}`)
  await cleo.page.getByTestId('register-form').waitFor()
  await screenChecks(cleo.page, 'the registration page')
  const { subject } = await registerThrough(cleo.page, `${APP}/register/${invite}`, emailC)
  check('the confirmation email comes from Splitpost', /Splitpost/.test(subject))
  const c = idOf(emailC)
  check('membership comes from the invitation link (creator cohort)', sql(`select cohort || '|' || status from ops.member_access where user_id = '${c}'`) === 'creator|active')
  check('the registration is an invitation, with no referrer', sql(`select kind || '|' || coalesce(referrer_id::text, 'none') from ops.registrations where user_id = '${c}'`) === 'invitation|none')

  // ---------------------------------------------------------------------------
  step('2. Setup: "Share my own work", interests, about you, and how My Split works')
  await nameStep(cleo.page, userC, 'Cleo Creator')
  await screenChecks(cleo.page, 'setup, what brings you here')
  await cleo.page.getByRole('radio', { name: /Share my own work/ }).check()
  await cleo.page.getByRole('button', { name: 'Continue', exact: true }).click()
  await cleo.page.getByRole('heading', { name: 'What are you into?' }).waitFor()
  for (const t of ['Food & cooking', 'Travel', 'Books & writing']) await topicButton(cleo.page, t).click()
  await cleo.page.getByRole('button', { name: 'Continue', exact: true }).click()
  await cleo.page.getByRole('heading', { name: 'Tell people about you' }).waitFor()
  await cleo.page.getByLabel('Short bio').fill('Home cook sharing weeknight recipes.')
  await cleo.page.getByLabel('Why should people follow you?').fill('A new 20-minute dinner every week.')
  await cleo.page.getByRole('button', { name: 'Save and continue' }).click()
  await cleo.page.getByRole('heading', { name: 'People you might like' }).waitFor()
  check('a founder link names no inviter, so no "You\'re here because of" card', (await cleo.page.getByTestId('inviter-card').count()) === 0)
  check('nobody was followed on Cleo\'s behalf', sql(`select count(*) from social.follows where follower_id = '${c}'`) === '0')
  await cleo.page.getByRole('button', { name: 'Continue', exact: true }).click()
  await cleo.page.getByRole('heading', { name: 'How My Split works' }).waitFor()
  const intro = flat(await cleo.page.getByTestId('my-split-intro').innerText())
  check('How My Split works: contributions are recognized, some become redeemable after review, all simulated and nothing paid',
    /You add value/.test(intro) && /redeemable after a quick review/.test(intro) && /simulated/.test(intro) && /nothing is paid/.test(intro), intro)
  check('How My Split works shows no allocation percentages', !/\d+\s*%/.test(intro))
  await screenChecks(cleo.page, 'setup, how My Split works')
  check('the identity, interests and bio are saved',
    sql(`select d.identity || '|' || (select string_agg(topic, ',' order by topic) from social.member_topics where user_id = d.user_id) || '|' || (d.bio is not null) from social.profile_details d where d.user_id = '${c}'`) === 'creator|books,food,travel|true')
  await cleo.page.getByRole('link', { name: 'Set up my creator profile' }).click()
  await cleo.page.waitForURL(`${APP}/app/profile?edit=1`)
  const setup = cleo.page.getByTestId('creator-setup')
  await setup.waitFor()
  check('"Set up my creator profile" opens Profile with "Share your own work"', (await setup.getByRole('heading', { name: 'Share your own work' }).count()) === 1)

  // ---------------------------------------------------------------------------
  step('3. Creator setup: up to 3 posting topics; a fourth is not possible')
  for (const t of ['Food & cooking', 'Travel', 'Family & parenting']) await topicButton(setup, t).click()
  check('three posting topics are chosen', (await setup.getByTestId('posting-topic-progress').innerText()) === '3 of 3 chosen')
  check('a fourth posting topic cannot be chosen in the page', await topicButton(setup, 'Music').isDisabled())
  await screenChecks(cleo.page, 'Profile with creator setup')
  await setup.getByRole('button', { name: 'Save topics' }).click()
  await setup.getByText("Saved. You'll appear in suggestions for these topics.").waitFor()
  check('the three posting topics are stored', sql(`select string_agg(topic, ',' order by topic) from social.creator_topics where user_id = '${c}'`) === 'family,food,travel')
  const tC = await tokenFor(emailC)
  const four = await rpc(tC, 'app_set_creator_topics', { p_topics: ['food', 'travel', 'family', 'music'] })
  check('the database refuses a fourth posting topic too', four.status >= 400 && /too_many_posting_topics/.test(JSON.stringify(four.body)))
  check('the refused request changed nothing', sql(`select count(*) from social.creator_topics where user_id = '${c}'`) === '3')

  // ---------------------------------------------------------------------------
  step('4. The first post, with the first-post guide before it')
  await setup.getByRole('link', { name: 'Write a post' }).click()
  await cleo.page.waitForURL(`${APP}/app/new`)
  const guide = cleo.page.getByTestId('first-post-guide')
  await guide.waitFor()
  check('the first-post guide shows before the first post', /Your first post/.test(await guide.innerText()))
  await screenChecks(cleo.page, 'Create with the first-post guide')
  const postText = `Tonight: a 20-minute lemon pasta ${RUN}`
  await cleo.page.getByLabel('Write a post').fill(postText)
  await cleo.page.getByLabel('Topic (optional)').selectOption('food')
  await cleo.page.getByRole('button', { name: 'Post', exact: true }).click()
  await cleo.page.getByTestId('post-topic').waitFor()
  const post = sql(`select id from social.posts where author_id = '${c}' and body = '${postText}'`)
  check('the post is published with its topic', !!post && sql(`select topic from social.posts where id = '${post}'`) === 'food')
  await cleo.page.goto(`${APP}/app/new`)
  await cleo.page.getByLabel('Write a post').waitFor()
  await J.sleep(500)
  check('the first-post guide does not show again once she has posted', (await cleo.page.getByTestId('first-post-guide').count()) === 0)

  // ---------------------------------------------------------------------------
  step('5. Cleo copies her personal invitation link')
  await nav(cleo.page).getByTitle('Profile').click()
  await cleo.page.getByRole('link', { name: 'Edit profile' }).click()
  await setup.waitFor()
  await setup.getByRole('button', { name: 'Copy my invitation link' }).click()
  await setup.getByRole('button', { name: 'Link copied' }).waitFor()
  const link = await cleo.page.evaluate(() => navigator.clipboard.readText())
  const code = (link.match(/\/register\/([0-9a-f]{16})$/) || [])[1]
  check('the copied link is her personal link on this site', link.startsWith(`${APP}/register/`) && !!code)
  check('the link is Cleo\'s own referral link in the database', sql(`select count(*) from ops.registration_links where code = '${code}' and kind = 'referral' and owner_id = '${c}'`) === '1')

  // ---------------------------------------------------------------------------
  step('6. Nia joins through Cleo\'s link, sees who invited her, and follows by choice')
  const nia = await person(browser)
  await registerThrough(nia.page, link, emailN)
  const n = idOf(emailN)
  check('Nia is attributed to Cleo as a referral', sql(`select kind || '|' || referrer_id from ops.registrations where user_id = '${n}'`) === `referral|${c}`)
  await nameStep(nia.page, userN, 'Nia New')
  await nia.page.getByRole('radio', { name: /Find creators I'll love/ }).check()
  await nia.page.getByRole('button', { name: 'Continue', exact: true }).click()
  await topicButton(nia.page, 'Food & cooking').click()
  await nia.page.getByRole('button', { name: 'Continue', exact: true }).click()
  await nia.page.getByRole('button', { name: 'Save and continue' }).click()
  const inviter = nia.page.getByTestId('inviter-card')
  await inviter.waitFor()
  const card = flat(await inviter.innerText())
  check('setup shows "You\'re here because of" Cleo, with her posting topics', card.includes("You're here because of") && card.includes('Cleo Creator') && card.includes(`@${userC}`) && card.includes('Food & cooking'), card)
  check('nothing is followed until Nia chooses', sql(`select count(*) from social.follows where follower_id = '${n}'`) === '0')
  await screenChecks(nia.page, 'setup with who invited you')
  await inviter.getByRole('button', { name: 'Follow Cleo Creator' }).click()
  await inviter.getByText("You're following Cleo Creator.").waitFor()
  check('Nia now follows Cleo, by her own choice', sql(`select count(*) from social.follows where follower_id = '${n}' and creator_id = '${c}'`) === '1')
  // Founder decision (Nov 25, 20261215000000): bringing someone to your own profile earns
  // recognition points, never redeemable referral points; once per referred member.
  check('bringing Nia to her own profile earns Cleo recognition only: 20 points, not redeemable, nothing waiting for review',
    sql(`select string_agg(action || ':' || points || ':' || redeemable || ':' || status, ',') from sim.points_ledger where member_id = '${c}'`) === 'own_audience_referral:20:false:recognized')
  await nia.page.getByRole('button', { name: 'Continue', exact: true }).click()
  await nia.page.getByRole('button', { name: 'Go to my feed' }).click()
  await nia.page.getByRole('heading', { name: 'Home' }).waitFor()
  // She keeps Cleo close, opens the post from her Following feed and comments.
  await nia.page.goto(`${APP}/app/u/${userC}`)
  await nia.page.getByRole('button', { name: 'Join Clique (Cleo Creator)' }).click()
  await nia.page.getByRole('button', { name: 'In your Clique (Cleo Creator, tap to remove)' }).waitFor()
  check('Nia added Cleo to her Clique', sql(`select count(*) from social.clique_members where fan_id = '${n}' and creator_id = '${c}' and removed_at is null`) === '1')
  await nia.page.goto(`${APP}/app`)
  await nia.page.getByTestId('post').filter({ hasText: postText }).first().getByRole('link', { name: '0 comments' }).click()
  await nia.page.waitForURL(`${APP}/app/post/${post}`)
  await nia.page.getByLabel('Write a comment').fill('Made this tonight with my kids and it was a hit, thank you Cleo!')
  await nia.page.getByRole('button', { name: 'Comment' }).click()
  await nia.page.getByTestId('comment').filter({ hasText: 'it was a hit' }).waitFor()
  check('opening the post is recorded once', await sqlEventually(`select count(*) from social.post_opens where viewer_id = '${n}' and post_id = '${post}'`, '1') === '1')

  // ---------------------------------------------------------------------------
  step('7. Cleo strengthens the relationship: who joined, follow back, her own Clique')
  await cleo.page.goto(`${APP}/app/profile?edit=1`)
  const tools = cleo.page.getByTestId('creator-setup')
  await tools.waitFor()
  const t7 = flat(await tools.innerText())
  check('creator setup says one person joined through her link, and is complete', t7.includes('1 person has joined through it.') && t7.includes('Your creator tools'), t7)
  const audience = flat(await cleo.page.getByTestId('audience-insight').innerText())
  check('Your audience: 1 follower, 1 in her Clique, 1 Active Supporter', /1 Followers 1 Clique 1 Active Supporters/.test(audience), audience)
  await cleo.page.goto(`${APP}/app/u/${userN}`)
  await cleo.page.getByRole('button', { name: 'Follow Nia New' }).click()
  await cleo.page.getByTestId('follow-confirmation').getByRole('button', { name: 'Join Clique (Nia New)' }).click()
  await cleo.page.getByRole('button', { name: 'In your Clique (Nia New, tap to remove)' }).waitFor()
  await cleo.page.goto(`${APP}/app/clique`)
  const myClique = cleo.page.getByRole('region', { name: 'My Clique' })
  await myClique.getByRole('link', { name: 'Nia New' }).first().waitFor()
  check('Nia is in Cleo\'s Clique, as a connection both ways', sql(`select count(*) from social.clique_members where ((fan_id = '${c}' and creator_id = '${n}') or (fan_id = '${n}' and creator_id = '${c}')) and removed_at is null`) === '2')
  await screenChecks(cleo.page, 'Your Clique')

  // ---------------------------------------------------------------------------
  step('8. Attention, Retention and Money reflect the new follower')
  // Optional, for a person to look at (SHOTS=<directory>); never in CI.
  if (process.env.SHOTS) {
    const shot = async (url, name, ready) => {
      await cleo.page.goto(url)
      await ready.waitFor()
      await cleo.page.getByText(/^Checking your profile|^Loading/).first().waitFor({ state: 'detached' }).catch(() => {})
      await cleo.page.waitForLoadState('networkidle')
      await cleo.page.waitForTimeout(300)
      await cleo.page.screenshot({ path: require('node:path').join(process.env.SHOTS, `${name}-desktop.png`) })
      await cleo.page.setViewportSize({ width: 390, height: 844 })
      await cleo.page.waitForTimeout(300)
      await cleo.page.screenshot({ path: require('node:path').join(process.env.SHOTS, `${name}-phone.png`) })
      await cleo.page.setViewportSize({ width: 1280, height: 900 })
    }
    await shot(`${APP}/app/profile`, 'profile-own', cleo.page.getByTestId('insights-card'))
    await shot(`${APP}/app/u/${userN}`, 'profile-public', cleo.page.getByTestId('profile-counts'))
    const main = cleo.page.locator('main').first()
    for (const [route, name] of [['/app', 'home'], ['/app/clique', 'clique'], ['/app/discover', 'discover'], ['/app/new', 'create'], ['/app/split', 'my-split']]) {
      await shot(`${APP}${route}`, name, main)
    }
    // The full-screen faces, one after another.
    for (const face of ['Reach', 'Connection', 'Earnings']) {
      await cleo.page.goto(`${APP}/app/profile?insights=1`)
      await cleo.page.getByRole('tab', { name: face }).click()
      await cleo.page.waitForLoadState('networkidle')
      await cleo.page.waitForTimeout(400)
      await cleo.page.screenshot({ path: require('node:path').join(process.env.SHOTS, `face-${face.toLowerCase()}-desktop.png`) })
      await cleo.page.setViewportSize({ width: 390, height: 844 })
      await cleo.page.waitForTimeout(400)
      await cleo.page.screenshot({ path: require('node:path').join(process.env.SHOTS, `face-${face.toLowerCase()}-phone.png`) })
      await cleo.page.setViewportSize({ width: 1280, height: 900 })
    }
  }
  await cleo.page.goto(`${APP}/app/profile`)
  await screenChecks(cleo.page, 'Your profile (P1)')
  await cleo.page.goto(`${APP}/app/profile?insights=1`)
  await cleo.page.getByRole('tab', { name: 'Reach' }).click()
  const att = cleo.page.getByTestId('attention-face')
  await att.waitFor()
  const ta = flat(await att.innerText())
  const followers = sql(`select count(*) from social.follows where creator_id = '${c}'`)
  check('Attention: every post was available to her follower, who saw one', followers === '1' && ta.includes('Every post was available to your follower. They saw at least one.'), ta)
  check('Attention: where the new follower came from (the invitation card follows as Other)', /Where your new follower came from Other 1/.test(ta), ta)
  await screenChecks(cleo.page, 'the Attention face')
  await cleo.page.getByRole('tab', { name: 'Connection' }).click()
  const ret = cleo.page.getByTestId('retention-face')
  await ret.waitFor()
  const tr = flat(await ret.innerText())
  const connections = sql(`select count(*) from ops.connections(ops.week_start(now()), now()) where creator = '${c}'`)
  check('Retention: this week\'s connections match the database (1)', connections === '1' && tr.includes('1 follower connected with your posts this week'), `${connections}: ${tr.slice(0, 160)}`)
  check('Retention: 1 Active Supporter and 1 in her Clique, as in the database',
    /1 Active Supporter, 1 in your Clique/.test(tr) && sql(`select social.is_active_supporter('${n}', '${c}')`) === 't', tr.slice(0, 300))
  await screenChecks(cleo.page, 'the Retention face')
  await cleo.page.getByRole('tab', { name: 'Earnings' }).click()
  const money = cleo.page.getByTestId('money-face')
  await money.waitFor()
  const tm0 = flat(await money.innerText())
  check('Money before any ad revenue: Simulated, actual income $0.00, no ads yet', /Simulated/.test(tm0) && /Actual income Actual \$0\.00/.test(tm0) && /No ads have been shown with your posts yet/.test(tm0), tm0.slice(0, 240))

  // ---------------------------------------------------------------------------
  step('9. Simulated earnings: the founder records simulated revenue; Cleo understands her share')
  const month = sql("select to_char(date_trunc('month', now()) - interval '1 month', 'YYYY-MM')")
  {
    const fay = await person(browser)
    await signIn(fay.page, founder.email)
    await fay.page.goto(`${APP}/app/split`)
    await fay.page.getByRole('link', { name: 'Founder: review referrals and rewards' }).click()
    await fay.page.getByRole('button', { name: 'Record simulated revenue' }).waitFor()
    await fay.page.getByLabel('Month').fill(month)
    await fay.page.getByLabel('Creator username').fill(userC)
    await fay.page.getByLabel('Net amount ($)').fill('50')
    await fay.page.getByLabel('Note').fill('Creator journey: content campaign')
    await fay.page.getByRole('button', { name: 'Record simulated revenue' }).click()
    await fay.page.getByText(`Recorded $50.00 of simulated content advertising for ${month}.`).waitFor()
    await fay.ctx.close()
  }
  const share = sql(`select (sim.split('content_ad', 5000)).creator_cents`)
  check('the database gives Cleo the creator share of $50.00 (2000 cents)', share === '2000' && sql(`select sum(net_cents) from sim.revenue_entries where creator_id = '${c}'`) === '5000')
  await cleo.page.reload()
  await cleo.page.getByTestId('money-face').waitFor()
  const earn = cleo.page.getByTestId('simulated-earnings')
  await earn.waitFor()
  const te = flat(await earn.innerText())
  const tm = flat(await money.innerText())
  check('Money: her simulated share is $20.00, labelled Simulated', /Simulated/.test(te) && te.includes('$20.00') && te.includes('Your simulated share by month')
    // The total revenue is never shown beside her share, so the allocation can't be worked out (legal safeguard).
    && !te.includes('$50.00'), te)
  check('Money: a You, Fans and Splitpost bar, and "Nothing is paid during the pilot"', /You Fans Splitpost/.test(te) && te.includes('Nothing is paid during the pilot.'), te)
  check('Money: actual income stays $0.00, apart from the simulated figure', /Actual income Actual \$0\.00/.test(tm), tm.slice(-200))
  check('Money: no allocation percentages (no 40/20/40)', !/\d+\s*%/.test(tm) && !/40\s*\/\s*20/.test(tm))
  await screenChecks(cleo.page, 'the Money face with simulated earnings')
  check('nothing is paid: the only money is in the simulated schema', sql("select count(*) from pg_namespace where nspname = 'finance'") === '0')

  await nia.ctx.close()
  await cleo.ctx.close()
  sql("select ops.set_registration_settings('stakeholder-creator', 'journey: done', true)")
})
