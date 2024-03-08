import * as express from 'express';

export const app = express();

const PORT=3000
app.use(express.json());
app.use(express.urlencoded());

// Defining the structures for the users, user balances and orders
interface Balances {
  [key: string]: number;
}
  
interface User {
  id: string;
  balances: Balances;
};
  
  interface Order {
    userId: string;
    price: number;
    quantity: number;
  }

// Our stock
export const TICKER = 'NVIDIA';

// Defining the users, user balances and orders
const users: User[] = [{
    id: '1',
    balances: {
      NVIDIA: 10,
      USD: 50000,
    }
  }, {
    id: '2',
    balances: {
      NVIDIA: 20,
      USD: 50000,
    }
  }];

const bids: Order[] = [];
const asks: Order[] = [];

// Home page
app.get("/", (req: any,res: any) => {
    res.send(`Hello Trader`)
  })

// Place an order
app.post("/order", (req: any, res: any) => {
    // Extracting the side, price, quantity, and userId from the request body.
    const side: 'bid' | 'ask' = req.body.side;
    const price: number = req.body.price;
    const quantity: number = req.body.quantity;
    const userId: string = req.body.userId;

    //Fill or Kill condition - useful for market orders
    const FoK: boolean | null = req.body.FoK

  if(FoK) {
    const canFulfill = checkOrders(side,price,quantity,userId)
    if(!canFulfill) return res.json({"Error": "Cannot fulfill at current price."})
    }

    // useful for limit order
    const remainingQty = fillOrders(side, price, quantity, userId);

  if (remainingQty === 0) {
    res.json({ filledQuantity: quantity });
    return;
  }

  if (side === 'bid') {
    bids.push({
      userId: userId,
      price: Number(price),
      quantity: Number(remainingQty)
    });
    // ascending order
    bids.sort((a, b) => a.price < b.price ? -1 : 1);
  } else {
    asks.push({
      userId: userId,
      price: Number(price),
      quantity: Number(remainingQty)
    })
    // descending order
    asks.sort((a, b) => a.price < b.price ? 1 : -1);
  }

  res.json({
    filledQuantity: quantity - remainingQty,
  })
})


// Get the orderbook
app.get("/depth", (req: any, res: any) => {
    const depth: {
      [price: string]: {
        type: "bid" | "ask",
        quantity: number,
      }
    } = {};

    for (let i = 0; i < asks.length; i++) {
        if (!depth[asks[i].price]) {
          depth[asks[i].price] = {
            quantity: asks[i].quantity,
            type: "ask"
          };
        } else {
          depth[asks[i].price].quantity += asks[i].quantity;
        }
      }

    for (let i = 0; i < bids.length; i++) {
        if (!depth[bids[i].price]) {
          depth[bids[i].price] = {
            quantity: bids[i].quantity,
            type: "bid"
          };
        } else {
          depth[bids[i].price].quantity += bids[i].quantity;
        }
      }

  res.json({
        depth
    })
})


// Get user balance
app.get("/balance/:userId", (req, res) => {
    const userId = req.params.userId;
    const user = users.find(x => x.id === userId);
    if (!user) {
      return res.json({
        USD: 0,
        [TICKER]: 0
      })
    }
    res.json({ balances: user.balances });
  })


  app.post("/quote", (req, res) => {
    const userId: string = req.body.userId;
    const quantity: number = req.body.quantity;
    const side: string = req.body.side;

    let remainingQty = Number(quantity);
    let totalCost = 0;
    if(side === "bid") {
      for(let i = asks.length - 1; i >= 0; i--) {
        if(asks[i].userId === userId) {
          continue;
        }
        if(asks[i].quantity >= remainingQty) {
          totalCost += remainingQty * Number(asks[i].price);
          let averagePrice = totalCost / Number(quantity);
  
          res.json({"Quantity": quantity,"@averagePrice": averagePrice}) 
          return;
        } else {
            // If the quantity of the current ask is less than the remaining quantity, we subtract the quantity of the current ask from the remaining quantity and add the cost of the current ask to the total cost.
          remainingQty -= Number(asks[i].quantity);
          totalCost += Number(asks[i].quantity) * Number(asks[i].price);
          continue; // We continue to the next ask
        }
      }
    } else {
      for(let i = 0 ; i < bids.length; i++) {
            if(bids[i].userId === userId) {
              continue;
            }
            if(bids[i].quantity >= remainingQty) {
              totalCost += remainingQty * Number(bids[i].price);
              let averagePrice = totalCost / Number(quantity);
  
              res.json({"Quantity": quantity,"@averagePrice": averagePrice}) 
              return;
            } else {
              remainingQty -= Number(bids[i].quantity);
              totalCost += Number(bids[i].quantity) * Number(bids[i].price);
              continue;
            }
          }
    }
    res.json({"Error": "Insufficient liquidity"})
  });  


function flipBalance(userId1: string, userId2: string, quantity: number, price: number) {
  let user1 = users.find((x) => x.id === userId1);
  let user2 = users.find((x) => x.id === userId2);
  if (!user1 || !user2) {
    return;
  }

  user1.balances[TICKER] -= quantity;
  user2.balances[TICKER] += quantity;

  user1.balances['USD'] += (quantity * price);
  user2.balances['USD'] -= (quantity * price);
}


function fillOrders(side: string, price: number, quantity: number, userId: string): number {
  let remainingQuantity = quantity;

  if (side === "bid") {
    for (let i = asks.length - 1; i >= 0; i--) {
      if (asks[i].price > price) {
        break;
      }

      if(asks[i].userId === userId) {
        continue;
      }

      if (asks[i].quantity > remainingQuantity) {
        asks[i].quantity -= remainingQuantity;
        flipBalance(asks[i].userId, userId, remainingQuantity, asks[i].price);
        return 0;
      } else {
        remainingQuantity -= asks[i].quantity;
        flipBalance(asks[i].userId, userId, asks[i].quantity, asks[i].price);
        asks.pop();
      }
    }
  } else {
    for (let i = 0; i < bids.length; i++) {
        if (bids[i].price > price) {
          break;
        }
        if(bids[i].userId === userId) {
        continue;
      }
      if (bids[i].quantity > remainingQuantity) {
        bids[i].quantity -= remainingQuantity;
        flipBalance(userId, bids[i].userId, remainingQuantity, price);
        return 0; 
      } else {
        remainingQuantity -= bids[i].quantity;
        flipBalance(userId, bids[i].userId, bids[i].quantity, price);
        bids.shift();
        i--; // Decrement the index to account for the removed element
    }
    }
  }
  return remainingQuantity;
}

const checkOrders = (side: string, price: number, quantity: number, userId: string): boolean => {
    let remainingQuantity = quantity;
    if (side === "bid") {
      for (let i = asks.length - 1; i >= 0; i--) {
        if (asks[i].price > price) {
          break;
        }
        if (asks[i].quantity > remainingQuantity) {
          return true;
        } else {
          remainingQuantity -= asks[i].quantity;
          continue;
        }
      }
    } else {
      for (let i = 0; i < bids.length; i++) {
        if (bids[i].price > price) {
          break;
        }
        if (bids[i].quantity > remainingQuantity) {
          return true;
  
        } else {
          remainingQuantity -= bids[i].quantity;
          continue;
        }
      }
    }
    return false;
  }
  
  app.listen(PORT, () => {
    console.log(`App listening on port ${PORT}`)
  })



  


    


