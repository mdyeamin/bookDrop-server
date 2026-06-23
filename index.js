const express = require("express");
const app = express();
const port = process.env.PORT || 8000;
const cors = require("cors");
require("dotenv").config();
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = process.env.MONGODB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const myDB = client.db("BookDrop");
    const userCollection = myDB.collection("user");
    const bookCollection = myDB.collection("books");
    const paymentCollection = myDB.collection("payments"); // user payment korar por ekhane data asbe
    app.get("/", (req, res) => {
      res.send("Hello World!");
    });
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // user related api start here +*+*+*+*+*+*+*+*+**+*
    // get all users
    app.get("/api/users", (req, res) => {
      const result = userCollection.find().toArray();
      result.then((data) => {
        res.send(data);
      });
    });
    // delete user by id
    app.delete("/api/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);

      res.send(result);
    });
    // update user role by id
    app.patch("/api/users/:id", async (req, res) => {
      const id = req.params.id;
      const role = req.body.role;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: role,
        },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      console.log("update from  backend", result);
      res.send(result);
    });
    // user related api end here +*+*+*+*+*+*+*+*+**+*
    // Books related api Start here +*+*+*+*+*+*+*+*+**+*
    // post book by librarian
    app.post("/api/books", async (req, res) => {
      const book = req.body;
      const payload = {
        ...book,
        createdAt: new Date(),
      };

      const result = await bookCollection.insertOne(payload);

      res.send(result);
    });
    // get all books by current librarian
    app.get("/api/books", async (req, res) => {
      const userId = req.query.userid;
      const query = {};
      if (userId) {
        query.userId = userId;
      }

      const result = await bookCollection.find(query).toArray();
      console.log(userId);
      res.send(result);
    });

    //delete librarian's book by id
    app.delete("/api/books/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await bookCollection.deleteOne(filter);

      res.send(result);
    });

    // edit librarians's book by id
    app.patch("/api/books/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const bookInfo = req.body;
      const updateDoc = {
        $set: {
          ...bookInfo,
          updatedAt: new Date(),
        },
      };
      const result = await bookCollection.updateOne(filter, updateDoc);
      console.log("after updateBook", result);

      res.send(result);
    });

    // get all books for homepage (non-secure)
    app.get("/api/public/books", async (req, res) => {
      const result = await bookCollection.find().toArray();

      res.send(result);
    });

    // get single book by id (for details page)
    app.get("/api/public/books/:id", async (req, res) => {
      const id = req.params.id;
      const filter = {
        _id: new ObjectId(id),
      };
      const result = await bookCollection.findOne(filter);
      res.send(result);
    });
    // Books related api end here +*+*+*+*+*+*+*+*+**+*
    // Payment related api start here +*+*+*+*+*+*+*+*+**+*
    app.post("/api/payment", async (req, res) => {
      const { sessionId, userId, price, userEmail, title, productId } =
        req.body;

      const isExist = await paymentCollection.findOne({ sessionId });

      if (isExist) {
        return res.send({ message: "already exist" });
      }

      const result = await paymentCollection.insertOne({
        sessionId,
        userId,
        price,
        userEmail,
        title,
        productId,
      });

      res.send(result);
    });
    // Payment related api end here +*+*+*+*+*+*+*+*+**+*
    // Booking delivery related api start here +*+*+*+*+*+*+*+*+**+*
    // Booking delivery related api start here +*+*+*+*+*+*+*+*+**+*
    app.get("/api/my/order", async (req, res) => {
      try {
        const userId = req.query.userid;

        const matchStage = userId ? { userId: userId } : {};

        const result = await paymentCollection
          .aggregate([
            {
              $match: matchStage,
            },

            {
              $addFields: {
                productObjectId: { $toObjectId: "$productId" },
              },
            },

            {
              $lookup: {
                from: "books",
                localField: "productObjectId",
                foreignField: "_id",
                as: "bookDetails",
              },
            },

            {
              $unwind: {
                path: "$bookDetails",
                preserveNullAndEmptyArrays: true, 
              },
            },

            {
              $sort: { _id: -1 },
            },
          ])
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Error fetching user orders:", error);
        res.status(500).send({ message: "Failed to fetch orders" });
      }
    });
    // Booking delivery related api end here +*+*+*+*+*+*+*+*+**+*
    // Booking delivery related api end here +*+*+*+*+*+*+*+*+**+*

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
run().catch(console.dir);
