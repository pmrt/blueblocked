import { Agent, AppBskyGraphDefs, AppBskyGraphGetFollows, CredentialSession } from '@atproto/api'

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function unblockLists(agent: Agent, blocked: AppBskyGraphDefs.ListView[]) {
  console.log(`temporally unblocking lists`)
  for (let list of blocked) {
    await agent.unblockModList(list.uri)
  }
}
async function blockLists(agent: Agent, blocked: AppBskyGraphDefs.ListView[]) {
  console.log(`blocking lists again`)
  for (let list of blocked) {
    await agent.blockModList(list.uri)
  }
}

const session = new CredentialSession(new URL("https://bsky.social"))
await session.login({
  identifier: '<handle>',
  password: '<app password (NOT YOUR PASSWORD)>',
})
const agent = new Agent(session)

let lists: AppBskyGraphDefs.ListView[] = []
let blockedLists: AppBskyGraphDefs.ListView[] = []
let cursor: string | undefined
console.log('fetching list blocks')
do {
  const resp = await agent.app.bsky.graph.getListBlocks({
    cursor,
  })
  const respLists = resp.data?.lists
  cursor = resp.data?.cursor
  if (!respLists) {
    console.log("error while getting list blocks")
    console.log(resp)
    process.exit(1)
  }
  for (let list of respLists) {
    lists.push(list)
    blockedLists.push(list)
  }
} while(cursor)

cursor = undefined
console.log('fetching list mutes')
do {
  const resp = await agent.app.bsky.graph.getListMutes({
    cursor,
  })
  const respLists = resp.data?.lists
  cursor = resp.data?.cursor
  if (!respLists) {
    console.log("error while getting list mutes")
    console.log(resp)
    process.exit(1)
  }
  for (let list of respLists) {
    lists.push(list)
  }
} while(cursor)


console.log(`fetch lists complete. Total: ${lists.length}`)


interface User {
  handle: string
  did: string
}

let blockedAndMutedUsers: User[]= []
cursor = undefined
for (let list of lists) {
  console.log(`fetching list details for ${list.uri}`)
  do {
    const resp = await agent.app.bsky.graph.getList({
      list: list.uri,
      cursor: cursor,
      limit: 100,
    })
    const items = resp.data?.items
    cursor = resp.data?.cursor
    if (!items) {
      console.log(`error while getting list items for ${list.uri}`)
      console.log(resp)
      process.exit(1)
    }
    for (let item of items) {
      blockedAndMutedUsers.push({
        did: item.subject.did,
        handle: item.subject.handle,
      })
    }
  } while(cursor)
}
console.log(`fetching list complete. Total blocked/muted users: ${blockedAndMutedUsers.length}`)


// unblock lists so they show up on followed users
await unblockLists(agent, blockedLists)

console.log(`waiting a few seconds for the unblocks to take effect`)
await sleep(1000*3)

cursor = undefined
console.log(`getting followed users`)
let followedUsers: User[] = []
do {
  if (!agent.did) {
    console.log("error empty agent did")
    await blockLists(agent, blockedLists)
    process.exit(1)
  }
  let resp: AppBskyGraphGetFollows.Response
  try {
    resp = await agent.app.bsky.graph.getFollows({
      actor: agent.did,
      cursor: cursor,
      limit: 100,
    })
  } catch (err) {
    await blockLists(agent, blockedLists)
    console.error(err)
    process.exit(1)
  }
  const follows = resp.data?.follows
  cursor = resp.data?.cursor
  if (!follows) {
    await blockLists(agent, blockedLists)
    console.log("error while getting follows")
    console.log(resp)
    process.exit(1)
  }
  for (let follow of follows) {
    followedUsers.push({ did: follow.did, handle: follow.handle })
  }
} while (cursor)

console.log(`fetching followed complete. Total followed: ${followedUsers.length}`)

await blockLists(agent, blockedLists)

console.log("comparing followed and muted/blocked list")
console.log("--- RESULTS (Blocked/muted users you follow) ---")
// re-order for O(1) lookup later
const htBlocked = {}
for (let blocked of blockedAndMutedUsers) {
  htBlocked[blocked.did] = blocked.handle
}
let count = 0
for (let followed of followedUsers) {
  if (htBlocked[followed.did]) {
    console.log(`#${count+1} ${followed.handle}`)
    count++
  }
}
console.log("---")
console.log(`Found ${count} users followed and blocked/muted by lists`)
