// Instead of creating it as an independent app,
// we use it as an attachment to our currently existing app.
var express = require('express');
var router = express.Router();

// Import languages
var i18n = require('./i18n');

// This way, we're able to use the data properly as JSON.
var bodyParser = require('body-parser');

// Modules relating to user accounts
var sha512 = require('js-sha512').sha512;
var validator = require('validator');
var crypto = require('crypto');
var profanity = require('profanity-util');

// The main user database, not to be confused with the session database
var dataStore = require('nedb');
var db = new dataStore({ filename: 'db', autoload: true });

// import environment variables (do not uncomment this unless the variables are set)
/*
    var captchaSecret = process.env.CAPTCHA_SECRET;
    var captchaSiteKey = process.env.CAPTCHA_SITE;
    var apiKey = process.env.API_KEY;

    // check if the api key is valid, otherwise deny ANY functionality
    if (sha512(apiKey + '') != "0b8d819370a076884785850fdb5278b17558b8f83efa7f989f5ccbc75e937e81ded485c1f5538e353daeef12727371228e370f4fe5628c431b4210e472ed2ca1") {
       return { error: 401, text: "you shall not use this api" };
    }
*/

// Ensure that the previously mentioned module is hooked in.
router.use(bodyParser.urlencoded({ extended: false }));
router.use(bodyParser.json());

// backend functions
function isReserved(username) {
    // pretty self explanitory, checks if the username is reserved
    // returns: boolean
    var reservedUsernames = [ "evildea", "zamenhof", "admin", "owner", "staff", "team",
                              "vypr", "itwango", "stupiddroid", "moderator", "amuzulo",
                              "mod", "administrator", "support" ];

    // development usage only
    /*
        if (username.includes("test") || username.includes("retejo")) {
            return true;
        }
    */

    // profanity checks
    if (profanity.check(username).length != 0) {
        return true;
    }

    if (username.includes("fuck") || username.includes("fag") ||
        username.includes("nig")  || username.includes("fek") ||
        username.includes("fuk")) {
        return true;
    }

    // check if the username is one of the prereserved names
    for (var i = 0; i < reservedUsernames.length; i++) {
        if (username == reservedUsernames[i]) {
            return true;
        }
    }

    return false;
}

function databaseInsert(username, password, email, joinDate, salt) {
    // inserts the data into the database, no kidding, right?
    // returns: boolean

    // create a json object based on the values
    var data = {"username": username, "password": password, "email": email, "joinDate": joinDate, "salt": salt};

    db.insert(data, function (err, newDocument) {
        if (err != null) {
            return false;
        }
    });

    return true;
}

// login/signup routes
router.post('/signup', function (req, res) {
    // the sign up function
    // tl;dr - user creates an account, this makes sure everything is good
    // and if it is, allows it and saves it to the database
    var data = req.body;

    // makes sure that they match, so that way people don't mess up accidentally
    if (data.password != data.confirmpass) { res.send(req.session.language.RSP_SIGNUP_UNMATCH_PASS); return; }
    if (data.email != data.confirmemail) { res.send(req.session.language.RSP_SIGNUP_UNMATCH_EMAIL); return; }

    // escape every input, hash the password (with a random salt), and create a join date
    var salt = crypto.randomBytes(16).toString("hex");

    var username = validator.escape(data.username);
    var password = sha512(validator.escape(data.password) + salt);
    var email = validator.normalizeEmail(validator.escape(data.email));
    var joinDateObject = new Date();
    var joinDate = joinDateObject.getTime();

    // checks the database if the email and/or the username already exists
    db.find({$or: [{ "username": username }, { "email": email }]}, function (err, docs) {
        // if cases handling what happens as a result of the data;
        if (isReserved(username)) {
            res.send(req.session.language.RSP_SIGNUP_USER_RESERVED);
        } else if (docs.length != 0) {
            usernameOrEmail = (username === docs[0].username ? "username" : "email");
            switch (usernameOrEmail) {
                case "username":
                    res.send(req.session.language.RSP_SIGNUP_USER_USED);
                    break;
                case "email":
                    res.send(req.session.language.RSP_SIGNUP_EMAIL_USED);
                    break;
            }
        } else if (username.indexOf(' ') >= 0) {
            res.send(req.session.language.RSP_SIGNUP_USER_NOWHTSPC);
        } else if (!validator.isEmail(email)) {
            res.send(req.session.language.RSP_SIGNUP_INVALID_EMAIL);
        } else {
            if (!databaseInsert(username, password, email, joinDate, salt)) {
                res.send(req.session.language.RSP_SIGNUP_ERROR + joinDate.toString());
            } else {
                res.send(req.session.language.RSP_SIGNUP_SUCCESS);
            }
        }
    });
});

router.post("/login", function (req, res) {
    var data = req.body;

    var username = validator.escape(data.username);

    db.find({ "username": username }, function (err, docs) {
        if (docs.length != 0) {
            var queryResult = docs[0];
            var password = sha512(validator.escape(data.password) + queryResult.salt);

            if (password != queryResult.password) {
                res.send(req.session.language.RSP_LOGIN_PASSWORD_ERROR);
            } else {
                // save the language so that way it doesn't change
                // when regeneration happens
                var language = req.session.language;

                // regenerate to avoid session fixation
                req.session.regenerate(function() {
                    req.session.user = queryResult;
                    req.session.language = language;

                    res.send(req.session.language.RSP_LOGIN_SUCCESS);
                });
            }
        } else {
            res.send(req.session.language.RSP_LOGIN_USERNAME_ERROR);
        }
    });
});

router.get("/logout", function (req, res) {
    if (req.session.user) {
        req.session.destroy(function() {
            res.send(req.session.language.RSP_HOME_LOGOUT_SUCCESS);
        });
    } else {
        // as much as we can destroy the session, because one always exists
        // it's not really necessary to do as it's not like there's anything
        // to destroy other than some IDs.
        res.send(req.session.language.RSP_HOME_LOGOUT_ERROR);
    }
});


// routes that aren't related to any login system
router.post("/change_language", function (req, res) {
    // the api wrapper for i18n.changeLanguage()
    var data = req.body;
    var result = i18n.changeLanguage(req.session, data.language);
    res.send(result);
});

router.get("/id/:id", function (req, res) {
    // an api call for pulling the data of the user, will be used later, ignore for now
    res.set("Content-Type", "application/json");

    db.find({ _id: req.params.id }, function (err, result) {
        res.send(JSON.stringify(result[0]));

        if (err != null) {
            return {"err": "something goofed (id)"};
        }
    });
});

module.exports = router;
