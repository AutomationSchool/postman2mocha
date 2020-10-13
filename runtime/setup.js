const dotenv = require('dotenv');
const path = require('path');

if (process.env.env_name) {
  dotenv.config({
    path: path.join('./env', process.env.env_name + '.env')
  });
}
