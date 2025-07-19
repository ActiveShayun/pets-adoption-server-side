require('dotenv').config()
const express = require('express');
const app = express()
const cors = require('cors');
const cookieParser = require("cookie-parser")
const jwt = require("jsonwebtoken")
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
// console.log('stripe',stripe);
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000


app.use(cors({
    origin: [
        'http://localhost:5173',
        'https://adoption-auth.web.app',
    ],
    credentials: true
}))
app.use(express.json())
app.use(cookieParser());

const verifyToken = (req, res, next) => {
    const token = req?.cookies?.token
    console.log('verifyToken', token);

    if (!token) {
        return res.status(401).send({ message: 'unauthorized access' })
    }

    jwt.verify(token, process.env.SECRET_ACCESS_TOKEN, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'unauthorized access' })
        }
        req.user = decoded
        next()
    })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xlnwpku.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const petsCollections = client.db('PetsDB').collection('all-pets')
        const adoptedRequestCollections = client.db('PetsDB').collection('adoptedRequest')
        const userCollection = client.db('PetsDB').collection('users')
        const donationCollection = client.db('PetsDB').collection('CreateDonation')
        const provideDonationCollection = client.db('PetsDB').collection('provideDonation')
        const paymentsCollection = client.db('PetsDB').collection('payments')
        const reviewCollection = client.db('PetsDB').collection('allReview')

        // jwt related api
        app.post('/jwt', (req, res) => {
            const user = req.body;
            console.log('SECRET_ACCESS_TOKEN', process.env.SECRET_ACCESS_TOKEN);
            const taken = jwt.sign(user, process.env.SECRET_ACCESS_TOKEN, {
                expiresIn: '5h'
            })
            res.cookie('token', taken, {
                httpOnly: true,
                secure: false
            })
                .send({ success: true })
        })

        app.post('/logout', (req, res) => {
            res.clearCookie('token', {
                httpOnly: true,
                secure: false
            }).send({ success: true })
        })

        // const verifyToken = (req, res, next) => {

        //     if (!req.headers.authorization) {
        //         return res.status(401).send({ message: 'Unauthorized access: No token provided' });
        //     }
        //     const token = req.headers.authorization.split(' ')[1];
        //     // console.log('token', token);

        //     jwt.verify(token, process.env.SECRET_ACCESS_TOKEN, (err, decoded) => {
        //         if (err) {
        //             return res.status(401).send({ message: 'Unauthorized access: Invalid token' });
        //         }

        //         req.decoded = decoded;
        //         next();
        //     });

        // }

        // payment related api
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = Math.round(Number(price) * 100);
            console.log(amount, 'amount backend');

            if (isNaN(amount)) {
                return res.status(400).json({ error: 'invalid amount provided' })
            }
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            })

            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        // user related api
        app.post('/users', async (req, res) => {
            const users = req.body;
            console.log('users', users);
            const query = { email: users.email }
            const allReadyExits = await userCollection.findOne(query)
            if (allReadyExits) {
                return res.status({ message: 'user all ready exits ' })
            }
            const result = await userCollection.insertOne(users);
            res.send(result)
        })

        app.get('/users-pagination', async (req, res) => {
            const total = await userCollection.estimatedDocumentCount();
            res.send({ total })
        })

        app.get('/users-Admin/:email', async (req, res) => {
            const email = req.params.email;

            // console.log('decoded email', req.decoded?.email);

            // if (!email === req.decoded.email) {
            //     return res.status(403).send({ message: 'unauthorized access' })
            // }
            const query = { email: email };
            const user = await userCollection.findOne(query)
            // console.log('user', user);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin'
            }
            // console.log('admin', admin);
            res.send({ admin })
        })

        app.get('/single-User', async (req, res) => {
            const email = req.query.email;
            const query = { email: email }
            // console.log('user emmmail', query);
            const result = await userCollection.findOne(query)
            res.send(result)
        })

        app.patch('/make-admin/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await userCollection.updateOne(query, updateDoc);
            res.send(result)
        })

        app.get('/all-users', async (req, res) => {
            const page = parseInt(req.query.page)
            const size = parseInt(req.query.size)
            console.log('pagination query', page, size)
            const result = await userCollection.find()
                .skip(page * size)
                .limit(size)
                .toArray();
            res.send(result)
        })

        app.put('/updateProfile/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const user = req.body;
            const updateDoc = {
                $set: {
                    name: user.name,
                    email: user.email,
                    userPhoto: user.photo
                }
            }
            const result = await userCollection.updateOne(query, updateDoc);
            res.send(result)
        })

        // pets adoption related api
        app.post('/allPets', async (req, res) => {
            const pets = req.body;
            const result = await petsCollections.insertOne(pets);
            // console.log('result', result);
            res.send(result)
        })

        app.get('/allPets-pagination', async (req, res) => {
            const total = await petsCollections.estimatedDocumentCount()
            res.send({ total })
        })

        app.get('/admin-allPets', async (req, res) => {
            const page = parseInt(req.query.page)
            const size = parseInt(req.query.size)
            console.log('pagination all pats api ', page, size);
            const result = await petsCollections.find()
                .skip(page * size)
                .limit(size)
                .toArray()
            res.send(result)
        })

        app.get('/AllPets', async (req, res) => {
            const search = req.query.search;
            const category = req.query.category;
            // console.log(category);
            const filter = {
                ...(search && { petsName: { $regex: search, $options: 'i' } }
                ),
                ...(category && { petsCategory: category })
            }

            const result = await petsCollections.find(filter).toArray();
            res.send(result)
        })

        app.get('/petsDetails/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await petsCollections.findOne(query);
            res.send(result)
        })

        app.get('/my-added-pets', async (req, res) => {
            const email = req?.query?.email
            const query = { email: email };
            // const page = parseInt(req?.query?.page);
            // const size = parseInt(req?.query?.size);
            const result = await petsCollections.find(query).toArray();
            res.send(result)
        })

        // pagination my pets 
        app.get('/pets-pagination', async (req, res) => {
            const result = await petsCollections.estimatedDocumentCount()
            res.send({ result })
        })


        // adoption request api
        app.post('/adoption-request', async (req, res) => {
            const request = req.body;
            // console.log('request', request);
            const email = req.body;
            const query = { email: email }
            // console.log('adoption-request email', email);
            const find = await petsCollections.findOne(query)
            // console.log('find', find);
            if (find) {
                return res.status(400).send('You are not request your own pets.')
            }

            const { petsId } = req.body
            const filter = { _id: new ObjectId(petsId) }
            const updateDoc = {
                $inc: {
                    requestCount: 1
                }
            }

            const update = await petsCollections.updateOne(filter, updateDoc)
            // console.log('petsId', petsId);
            const result = await adoptedRequestCollections.insertOne(request);
            res.send(result)
        })

        app.put('/update-pets/:id', async (req, res) => {
            const pet = req.body;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    email: pet.email,
                    petsName: pet.petsName,
                    petsCategory: pet.petsCategory,
                    petsAge: pet.petsAge,
                    location: pet.location,
                    sortDescription: pet.sortDescription,
                    phoneNumber: pet.phoneNumber,
                    description: pet.description,
                    petsImg: pet.petsImg,
                    adopted: pet.adopted,
                    deadline: pet.deadline
                }
            }

            const result = await petsCollections.updateOne(filter, updateDoc);
            // console.log('update', result);
            res.send(result)
        })

        app.delete('/myAddedPets/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await petsCollections.deleteOne(query);
            res.send(result)
        })


        // chance adoption status
        app.patch('/accepts-adopted-request/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    adopted: 'Adopted'
                }
            }
            const result = await adoptedRequestCollections.updateOne(query, updateDoc);
            res.send(result)
        })
        app.patch('/unAdopted-request/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    adopted: 'UnAdopted'
                }
            }
            const result = await adoptedRequestCollections.updateOne(query, updateDoc);
            res.send(result)
        })

        // accepts adoption request
        app.patch('/adopted-status-chance/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    adopted: 'Adopted'
                }
            }
            const result = await petsCollections.updateOne(query, updateDoc);
            res.send(result)
        })
        app.patch('/adopted-request-cancel/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            // console.log('adopted-request-accepts', id);
            const updateDoc = {
                $set: {
                    adopted: 'UnAdopted'
                }
            }

            const update = await petsCollections.updateOne(filter, updateDoc);
            res.send(update)
        })

        // reject Adoption Request
        app.delete('/rejectAdoptionRequest/:id', async (req, res) => {
            const id = req.params.id;
            // console.log('reject-Adoption', id);
            const query = { _id: new ObjectId(id) };
            const result = await adoptedRequestCollections.deleteOne(query);
            res.send(result)

        })


        app.get('/adoptionRequest', async (req, res) => {
            const email = req?.query?.email;
            const query = { email };
            const result = await adoptedRequestCollections.find(query).toArray();
            // console.log('adoptionRequest', result, email);
            res.send(result)
        })

        // create donation api
        app.post('/create-donation', async (req, res) => {
            const donation = req.body;
            const result = await donationCollection.insertOne(donation);
            res.send(result)
        })

        app.get('/all-donation', async (req, res) => {
            const page = parseInt(req?.query?.page)
            const size = parseInt(req?.query?.size)
            const result = await donationCollection.find()
                .skip(page * size)
                .limit(size)
                .toArray();
            res.send(result)
        })

        app.get('/donation-pagination', async (req, res) => {
            const total = await donationCollection.estimatedDocumentCount()
            res.send({ total })
        })

        app.get('/my-donation', async (req, res) => {
            try {
                const email = req.query.email;
                const page = parseInt(req.query.page)
                const size = parseInt(req.query.size)

                if (!email) {
                    return res.status(400).send({ error: "Email query parameter is required." });
                }

                const query = { donationEmail: email };
                const result = await donationCollection.find(query)
                    .skip(page * size)
                    .limit(size)
                    .toArray();

                res.send(result);
            } catch (error) {
                res.status(500).send({ error: "Something went wrong." });
            }
        });


        app.get('/my-donation-pagination/:email', async (req, res) => {
            const result = await donationCollection.estimatedDocumentCount()
            res.send({ result })
        })

        app.get('/details-donation/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await donationCollection.findOne(query);
            res.send(result)
        })

        // update donation
        app.put('/edit-my-donation/:id', async (req, res) => {
            const myDonation = req.body;
            const id = req.params.id;
            // console.log('myDonation id', id);
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    petsImage: myDonation.petsImage,
                    petsName: myDonation.petsName,
                    amount: myDonation.amount,
                    sortDescription: myDonation.sortDescription,
                    logDescription: myDonation.logDescription,
                    deadline: myDonation.deadline,
                    donationEmail: myDonation.donationEmail,
                    Pause: myDonation.Pause
                }
            }

            const result = await donationCollection.updateOne(filter, updateDoc);
            res.send(result)
        })

        // update donation control
        app.patch('/update-donation-control/:id', async (req, res) => {
            const id = req.params.id;
            // console.log('id', id);
            const query = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    Pause: 'Pause'
                }
            }
            const result = await donationCollection.updateOne(query, updateDoc);
            res.send(result)
        })
        app.patch('/update-donation-status/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    Pause: 'UnPause'
                }
            }
            const result = await donationCollection.updateOne(query, updateDoc);
            res.send(result)
        })

        // viewDonators 
        app.get('/viewDonators/:id', async (req, res) => {
            const id = req.params.id;
            const query = { donationId: id }
            const result = await provideDonationCollection.find(query).toArray()
            res.send(result)
        })

        // provide- donation api
        app.post('/provide-donation', async (req, res) => {
            const provide_donation = req.body;
            const { donationAmount, donationId } = req.body;
            const presentAmount = parseInt(donationAmount)
            console.log('donationAmount', presentAmount);

            const id = donationId
            console.log('donationID', id);
            const query = { donationId: donationId };
            const singleDonation = await provideDonationCollection.findOne(query)
            console.log('singleDonation', singleDonation);
            const updateAmount = {
                $inc: {
                    amount: + presentAmount
                }
            }
            const updateOne = await donationCollection.updateOne(query, updateAmount)
            const result = await provideDonationCollection.insertOne(provide_donation);
            res.send({ result, updateOne })
        })

        app.get('/all-provide-donation', verifyToken, async (req, res) => {
            const result = await provideDonationCollection.find().toArray()
            res.send(result)

        })

        app.post('/payments', async (req, res) => {
            const payments = req.body;
            const result = await paymentsCollection.insertOne(payments);
            // delete donation card
            const query = {
                _id: {
                    $in: payments.cardId.map(id => new ObjectId(id))
                }
            }
            const deletedResult = await provideDonationCollection.deleteMany(query)
            res.send({ result, deletedResult })
        })

        app.get('/payments', async (req, res) => {
            const page = parseInt(req?.query.page)
            const size = parseInt(req?.query.size)
            console.log('payments pagination page', page);
            console.log('payments pagination size', size);
            const email = req?.query?.email
            const query = { email: email }
            const total = await paymentsCollection.estimatedDocumentCount()
            const result = await paymentsCollection.find(query)
                .skip(page * size)
                .limit(size)
                .sort({ price: 1 }).toArray()
            res.send({ result, total })
        })

        app.get('/my-donations/:email', async (req, res) => {
            const email = req.params.email;
            const query = { donnerEmail: email }
            const result = await provideDonationCollection.find(query).toArray();
            res.send(result)
        })

        app.delete('/remove-donation/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await donationCollection.deleteOne(query);
            res.send(result)
        })

        // add review api
        app.post('/addReview', async (req, res) => {
            const review = req.body;
            const result = await reviewCollection.insertOne(review);
            res.send(result)
        })

        app.get('/review', async (req, res) => {
            const result = await reviewCollection.find().toArray()
            res.send(result)
        })

        // status and analytics
        app.get('/admin-status', async (req, res) => {
            const users = await userCollection.estimatedDocumentCount();
            const allPets = await petsCollections.estimatedDocumentCount();
            const adoptedRequest = await adoptedRequestCollections.estimatedDocumentCount();
            const provideDonationCollections = await provideDonationCollection.estimatedDocumentCount();

            const result = await paymentsCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        totalRevenue: {
                            $sum: '$price'
                        }
                    }
                }
            ]).toArray()

            const totalDonation = result?.length > 0 ? result[0].totalRevenue : 0
            res.send(
                [{
                    users,
                    allPets,
                    totalDonation,
                    adoptedRequest,
                    provideDonationCollections
                }]
            )
        })

        app.get('/donation-state', async (req, res) => {
            const result = await paymentsCollection.aggregate([
                {
                    $unwind: '$donationId'
                },
                {
                    $addFields: {
                        donationId: { $toObjectId: '$donationId' }
                    }
                },
                {
                    $lookup: {
                        from: 'CreateDonation',
                        localField: 'donationId',
                        foreignField: '_id',
                        as: 'allDonation'

                    }
                },
                {
                    $unwind: '$allDonation'
                },
                {
                    $group: {
                        _id: '$allDonation.category',
                        quantity: { $sum: 1 },
                        revenue: { $sum: '$allDonation.amount' }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        category: '$_id',
                        quantity: '$quantity',
                        revenue: '$revenue'
                    }
                }

            ]).toArray()
            res.send(result)
        })
        // Send a ping to confirm a successful connection

        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('PETS ADOPTION SERVER IS RUNNING')
})

app.listen(port, () => {
    console.log(`PETS ADOPTION SERVER IS RUNNING on ${port}`);
})

