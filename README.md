# Meal kit API

A small REST API for meal kits. MongoDB stores reusable ingredients, item recipes, and durable order snapshots. Redis stores short lived user carts. An item recipe references ingredient documents, so ingredients can be shared by many meals; an order copies the recipe details at purchase time so later catalog edits do not change an existing order.

## Run locally

1. Copy `.env.example` to `.env` and set a private `OWNER_API_KEY`.
2. Start MongoDB and Redis with `docker compose up -d`.
3. Run `npm install`, then `npm run dev`.

The API listens on `http://localhost:3000`. `GET /health` checks service connectivity.

## Data model

- `ingredients`: one document per shared pantry ingredient, including a base unit and active flag.
- `items`: sellable meal kits with price, servings, and recipe entries (`ingredient` reference, amount, unit, optional packaging instructions such as `sachet`). Amounts describe one kit.
- `orders`: durable purchase record with item, price, and ingredient snapshots; each line's ingredient amounts are for one kit and multiply by its quantity.
- Redis `cart:<userId>`: hash from item ID to quantity, expiring after seven days.

Amounts are numbers paired with units. Keep units consistent for an ingredient (for example, `g` for dried chickpeas); packaging notes describe how to portion the ingredient and do not affect measurement.

## API

Send `x-user-id: demo-user` for cart and order endpoints. For owner endpoints, send `x-owner-api-key: <OWNER_API_KEY>`. This simple header is for local API development; a production app should replace it with account authentication and authorization.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/items?search=chola` | List active kits, optionally search by name/description |
| GET | `/api/items/:id` | Get one active kit and its ingredient details |
| GET | `/api/ingredients` | List active ingredients |
| GET | `/api/owner/ingredients` | Owner list, including inactive ingredients |
| POST | `/api/owner/ingredients` | Create an ingredient |
| PATCH | `/api/owner/ingredients/:id` | Update an ingredient |
| DELETE | `/api/owner/ingredients/:id` | Deactivate an ingredient |
| POST | `/api/owner/items` | Create a meal kit/recipe |
| GET | `/api/owner/items` | Owner list, including inactive items |
| PATCH | `/api/owner/items/:id` | Update item details or recipe ingredients |
| DELETE | `/api/owner/items/:id` | Deactivate an item |
| GET | `/api/cart` | Read the current user's cart |
| POST | `/api/cart/items` | Add quantity to a cart item |
| DELETE | `/api/cart/items/:itemId` | Remove one item from cart |
| DELETE | `/api/cart` | Empty the cart |
| POST | `/api/orders` | Place order from cart, persist snapshot, then clear unchanged cart |
| GET | `/api/orders/:id` | Read an order belonging to the current user |

### Example requests

Create ingredient:

```sh
curl -X POST http://localhost:3000/api/owner/ingredients \
  -H 'content-type: application/json' -H 'x-owner-api-key: change-this-to-a-long-random-secret' \
  -d '{"name":"Dried chickpeas","baseUnit":"g"}'
```

Create a kit using the returned ingredient `_id` (replace `INGREDIENT_ID`):

```sh
curl -X POST http://localhost:3000/api/owner/items \
  -H 'content-type: application/json' -H 'x-owner-api-key: change-this-to-a-long-random-secret' \
  -d '{"name":"Chola Bhatura Kit","description":"Ingredients portioned for two servings","price":249,"servings":2,"ingredients":[{"ingredient":"INGREDIENT_ID","amount":200,"unit":"g","packaging":"main pouch"}]}'
```

Add to cart and place the order:

```sh
curl -X POST http://localhost:3000/api/cart/items \
  -H 'content-type: application/json' -H 'x-user-id: demo-user' \
  -d '{"itemId":"ITEM_ID","quantity":1}'
curl -X POST http://localhost:3000/api/orders -H 'x-user-id: demo-user'
```

`POST /api/cart/items` adds the supplied quantity to what is already in the cart. The order is saved before the cart is cleared. The clear operation checks that the cart still matches the version used for checkout, so a concurrent cart change is retained.
