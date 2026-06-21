const express = require("express");
const app = express();
const port = process.env.PORT || 8000;
const cors = require("cors");
require("dotenv").config();
app.use(cors());
app.use(express.json());
app.get("/", (req, res) => {
  res.send("Hello World!");
});

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
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const myDB = client.db("BookDrop");
    const userCollection = myDB.collection("user");
    const bookCollection = myDB.collection("books");
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
      const result = await bookCollection.insertOne(book);

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

    // Books related api end here +*+*+*+*+*+*+*+*+**+*

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
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
