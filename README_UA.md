# AlgoTradeX Backend (Vercel)

Папка `backend-binance/` — окремий бекенд для живих даних Binance Futures.

## Структура

```
backend-binance/
├── api/
│   ├── account.js   → GET /api/account?bot=alpha|beta|all
│   └── health.js    → GET /api/health
├── vercel.json
├── package.json
└── README_UA.md
```

## Як залити на GitHub

У репозиторії дашборду:

```
твій-репо/
├── index.html          ← фронт (дашборд)
└── backend-binance/            ← ця папка
    ├── api/
    ├── vercel.json
    └── package.json
```

## Деплой на Vercel

1. vercel.com → Add New Project → вибери репо
2. Root Directory → Edit → вкажи **backend-binance**
   (важливо: щоб Vercel бачив саме backend-binance/api/)
3. Deploy

Або окремий проект тільки з вмістом backend-binance/.

## Environment Variables

Vercel → Project → Settings → Environment Variables:

- BINANCE_API_KEY_ALPHA
- BINANCE_API_SECRET_ALPHA
- BINANCE_API_KEY_BETA
- BINANCE_API_SECRET_BETA
- ALLOWED_ORIGIN = https://algotradex.ai

Один акаунт на обидві стратегії:
  BINANCE_API_KEY=...
  BINANCE_API_SECRET=...

Після змінних → Redeploy.

## Перевірка

https://ТВІЙ_ПРОЕКТ.vercel.app/api/health
https://ТВІЙ_ПРОЕКТ.vercel.app/api/account?bot=all

## Дашборд

Settings → Binance proxy URL:
https://ТВІЙ_ПРОЕКТ.vercel.app
→ Save & Sync

## Binance API

- Тільки Read (Futures)
- Без Withdraw / Transfer
- Secret ніколи не комітити в Git
