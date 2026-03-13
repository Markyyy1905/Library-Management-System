// node mainapp/services/db.js
const odbc = require('odbc');
const path = require('path');

const DATABASE_PATH = path.join(__dirname, '..', 'data', 'LMS.accdb');

async function connectDB() {
    try {
        const connection = await odbc.connect(
            `Driver={Microsoft Access Driver (*.mdb, *.accdb)};Dbq=${DATABASE_PATH};`
        );
        console.log('✅ Database connected');
        console.log('📁 Path:', DATABASE_PATH);
        return connection;
    } catch (err) {
        console.error('❌ Database connection failed');
        console.error(err);
    }
}

// Immediately invoke for debug when running db.js directly
if (require.main === module) {
    (async () => {
        await connectDB();
    })();
}

module.exports = connectDB;