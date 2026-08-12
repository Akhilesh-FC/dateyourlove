# Notification Payload Integration Guide

Ye doc frontend team ko easy integration ke liye banaya gaya hai. Backend ne notification payload ko is format me diya hai taaki app ko `type` ke base par redirect aur UI update easy ho.

## 1) Notification payload contract

### A. Like / Superlike payload

```json
{
  "click_action": "FLUTTER_NOTIFICATION_CLICK",
  "type": "like",
  "fromUserId": "123",
  "fromUserName": "Aisha",
  "screen": "likes"
}
```

Superlike ke liye:

```json
{
  "click_action": "FLUTTER_NOTIFICATION_CLICK",
  "type": "superlike",
  "fromUserId": "123",
  "fromUserName": "Aisha",
  "screen": "likes"
}
```

### B. Match payload

```json
{
  "click_action": "FLUTTER_NOTIFICATION_CLICK",
  "type": "match",
  "matchedUserId": "123",
  "matchedUserName": "Aisha",
  "screen": "matches"
}
```

## 2) Redirect rules

Frontend ko simple rule follow karna chahiye:

- `type === "match"` => route to matches screen
- `type === "like" || type === "superlike"` => route to likes screen
- `screen` field ko fallback/secondary route ke liye use kar sakte ho

Example:

```js
const type = data?.type;

if (type === 'match') {
  navigate('/matches');
} else if (type === 'like' || type === 'superlike') {
  navigate('/likes');
}
```

## 3) Socket event payloads

Backend socket notifications bhi same intent ke sath bhejta hai.

### Like event

```json
{
  "type": "like",
  "from": 123,
  "fromName": "Aisha",
  "message": "Aisha liked you!"
}
```

### Match event

```json
{
  "type": "match",
  "users": ["123", "456"],
  "message": "You have a new match!"
}
```

Frontend ko socket event par bhi same logic apply karna chahiye:

```js
socket.on('notification', (payload) => {
  if (payload.type === 'match') {
    // show match toast/banner
    // navigate to matches
  }

  if (payload.type === 'like' || payload.type === 'superlike') {
    // show like toast/banner
    // navigate to likes
  }
});
```

## 4) Backend behavior summary

### Like flow

1. User A likes User B.
2. Backend sends push to User B with `type = "like"`.
3. Frontend receives payload and routes to likes screen.
4. Agar User B ne bhi User A ko like kiya hota hai, then match creates.

### Match flow

1. Mutual like creates match.
2. Backend sends push to both users with `type = "match"`.
3. Frontend routes to matches screen.

## 5) Important implementation notes

- `type` field is mandatory for notification routing.
- `screen` field optional but recommended for fallback redirect logic.
- UI ke liye `type` check karna hi enough hai; extra field parse karne se safe rahega.
- Koi additional `type` alias nahi rakha jata hai; backend same naming follow karta hai.

## 6) Frontend integration checklist

- [ ] Notification open handler me `data.type` read karo
- [ ] `match` => open matches screen
- [ ] `like` / `superlike` => open likes screen
- [ ] `fromUserId` ya `matchedUserId` ko profile open karne ke liye use karo
- [ ] Socket `notification` event ko bhi handle karo
- [ ] Duplicate or multiple redirect logic avoid karo

## 7) Sample handler

```js
function handleNotificationData(data) {
  if (!data || !data.type) return;

  switch (data.type) {
    case 'match':
      navigate('/matches');
      break;

    case 'like':
    case 'superlike':
      navigate('/likes');
      break;

    default:
      break;
  }
}
```

## 8) Final contract

```json
{
  "click_action": "FLUTTER_NOTIFICATION_CLICK",
  "type": "like | superlike | match",
  "fromUserId": "<user id>",
  "fromUserName": "<name>",
  "matchedUserId": "<user id>",
  "matchedUserName": "<name>",
  "screen": "likes | matches"
}
```

Ye contract frontend team ke liye final source of truth hai.
