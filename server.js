/*
インストール
npm install jsonwebtoken
npm install bcryptjs
npm install mysql2
npm install --save dotenv
npm install body-parser
npm install cors
npm install ejs
npm install path

//新規
npm install multer
npm install express-session
*/

// Import Modules
require('dotenv').config();
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const favicon = require('express-favicon');
const path = require('path');

// 環境変数の読み込み
const PORT = process.env.PORT || 3000;
const DB_HOST = process.env.DB_HOST;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;
const SECRET_KEY = process.env.SECRET_KEY;

// Express Initialize
const app = express();

// ================== Session Config ==================
app.use(session({
    secret: SECRET_KEY,
    resave: false,
    saveUninitialized: false,
}));

// ================ ejsテンプレートエンジン設定 ================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ================ Multer設定(メモリ上にファイルを保持) ================
const storage = multer.memoryStorage();
const upload = multer({ storage: storage }).fields([
    { name: 'appetizer-image' },
    { name: 'soup-image' },
    { name: 'fish-image' },
    { name: 'meat-image' },
    { name: 'maindish-image' },
    { name: 'salad-image' },
    { name: 'dessert-image' },
    { name: 'drink-image' },
]);

// (必要であれば専用のフォルダに保存したい場合はdiskStorageを使用)

// ================ Logger Middleware ================
const loggerMiddleware = require('./middlewares/logger');
app.use(loggerMiddleware);

// ================== セッション情報 EJS ==================
app.use((req, res, next) => {
    res.locals.session = req.session;
    res.locals.currentPath = req.path;
    next();
});

// ================ Middleware ================
app.use(express.static('public'));
app.use(favicon(__dirname + '/public/images/favicon.ico'));
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


// ================ MySQL 接続設定 ================
const db = mysql.createConnection({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME
});

// ================ Database Connection ================
db.connect((err) => {
    if (err) {
        console.error('データベース接続エラー:', err);
        return;
    }
    console.log('=== Connect MySQL ===');
    console.log('DB_HOST: ' + DB_HOST + '\nDB_USER: ' + DB_USER, '\nDB_NAME: ' + DB_NAME + '\nThread ID: ' + db.threadId);
    console.log('=====================\n');
});

// ---------- パスを送る ----------
app.use((req, res, next) => {
    res.locals.currentPath = req.path;
    next();
});

// ===================== ルーティング =====================

// ---------- トップページ ----------
app.get('/', (req, res) => {
    res.render('index');
});

// ---------- ログイン (GET)  ----------
app.get('/login', (req, res) => {
    // ログイン済みの場合、ホームに遷移
    if (req.session.user) return res.redirect('home');
    res.render('login');
});

// ---------- ログイン (POST) ----------
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // バリデーション (空文字チェック)
        if (!username || !password) {
            return res.status(400).send('ユーザ名とパスワードを入力してください');
        }

        // ユーザー情報をDBから取得
        db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
            if (err) {
                console.error('ログインエラー:', err);
                return res.status(500).send('サーバーエラーが発生しました');
            }

            // ユーザーが存在するかチェック
            if (results.length === 0) {
                return res.send('ユーザーが見つかりません');
            }

            const user = results[0];
            // パスワードの照合
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.send('パスワードが違います');
            }

            try {
                // JWTの発行
                const token = jwt.sign(
                    { userId: user.id, username: user.username },
                    SECRET_KEY,
                    { expiresIn: '1h' }
                );

                req.session.user = {
                    id: user.id,
                    username: user.username,
                    email: user.email
                };

                console.log('Generated Token:', token);

                // ログイン成功時
                res.render('home', {
                    username: user.username,
                    token: token
                });

            } catch (error) {
                console.error('JWT Error:', error);
                return res.status(500).send('JWTの生成中にエラーが発生しました');
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('サーバーエラーが発生しました');
    }
});

// ---------- ログアウト ----------
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('ログアウトエラー:', err);
            return res.status(500).send('ログアウト中にエラーが発生しました');
        }
        res.redirect('/'); // トップページに遷移
    });
});

// ---------- サインアップページ (GET) ----------
app.get('/signup', (req, res) => {
    // ログイン済みの場合、ホームに遷移
    if (req.session.user) return res.redirect('/home');
    res.render('signup');
});

// ---------- サインアップ(入力後 -> 確認画面) (POST) ----------
app.post('/signup', (req, res) => {
    const { username, email, password, confirm_password } = req.body;

    if (password !== confirm_password) {
        return res.send('<p>パスワードが一致しません <a href="/signup">戻る</a></p>');
    }

    // 確認画面にデータを渡す
    res.render('confirm', { username, email, password });
});

// ---------- /register (会員登録) ----------
app.post('/register', async (req, res) => {
    console.log('ユーザーから送られてきた会員情報', req.body);
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).send('全ての会員情報を入力してください');
    }

    // パスワードのハッシュ化
    const hashedPassword = await bcrypt.hash(password, 10);

    // ユーザーをDBにINSERT
    const query = 'INSERT INTO users (username,email,password) VALUES (?, ?, ?)';
    db.query(query, [username, email, hashedPassword], (err, results) => {
        if (err) {
            // (主キー重複やユニーク制約エラーなど)
            console.error('ユーザー登録エラー:', err);
            return res.send('登録中にエラーが発生しました。ユーザーネームが既に存在する可能性があります。<a href="/signup">戻る</a>');
        }
        console.log(`ユーザー ${username} が登録されました。 ID: ${results.insertId}`);
        res.render('success', { username });
    });
});

// ---------- ホーム ----------
app.get('/home', loginCheck, (req, res) => {
    const userid = req.session.user.id;
    const username = req.session.user.username;

    res.render('home', {
        username: username,
        token: req.session.user
    });

    // jwt.verify(req.session.user, SECRET_KEY, (err, user) => {
    //     const token = req.session.user;
    //     if (err) {
    //         console.error('JWTエラー:', err);
    //         return res.status(403).send('セッションが切れました。再度ログインしてください');
    //     } else {
    //         console.log('ユーザー:', user);
    //         res.render('home', {
    //             username: user.username,
    //             token: token
    //         });
    //     }
    // });
});

// ---------- 検索 ----------
app.get('/search', loginCheck, (req, res) => {
    res.render('search');
});

// ================== プロフィール取得 (GET) ==================
const fs = require('fs'); // ファイルシステムを使用するため
app.get('/profile', loginCheck, (req, res) => {
    const userId = req.session.user.id;

    const userQuery = 'SELECT username, profile_image, bio FROM users WHERE id = ?';

    db.query(userQuery, [userId], (err, results) => {
        if (err) {
            console.error('ユーザー情報取得エラー:', err);
            return res.status(500).send('サーバーエラーが発生しました');
        }

        if (results.length === 0) {
            return res.status(404).send('ユーザーが見つかりません');
        }

        const user = {
            username: results[0].username,
            profileImage: results[0].profile_image
                ? `data:image/png;base64,${results[0].profile_image.toString('base64')}`
                : '/images/default-user-icon.png', // デフォルト画像
            bio: results[0].bio || '自己紹介が未設定です。'
        };

        res.render('profile', { username: user.username, profileImage: user.profileImage, bio: user.bio });
    });
});

const uploadProfileImage = multer({ storage: multer.memoryStorage() });

const MAX_BIO_LENGTH = 200;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

app.post('/profile/edit', loginCheck, uploadProfileImage.single('profile_image'), (req, res) => {
    try {
        const userId = req.session.user.id;
        let bio = req.body.bio ? req.body.bio.trim() : null;
        const profileImage = req.file ? req.file.buffer : null;

        // バイオの改行を除外して文字数をカウント
        if (bio && bio.replace(/\r?\n/g, "").length > MAX_BIO_LENGTH) {
            return res.status(400).json({ error: `自己紹介は最大${MAX_BIO_LENGTH}文字までです。(改行を除く)` });
        }

        // 画像のサイズチェック
        if (req.file && req.file.size > MAX_IMAGE_SIZE) {
            return res.status(400).json({ error: `画像サイズは最大 ${MAX_IMAGE_SIZE / (1024 * 1024)}MB までです。` });
        }

        let updateQuery, updateValues;
        if (profileImage) {
            updateQuery = 'UPDATE users SET bio = ?, profile_image = ? WHERE id = ?';
            updateValues = [bio, profileImage, userId];
        } else {
            updateQuery = 'UPDATE users SET bio = ? WHERE id = ?';
            updateValues = [bio, userId];
        }

        db.query(updateQuery, updateValues, (err, result) => {
            if (err) {
                console.error('プロフィール更新エラー:', err);
                return res.status(500).json({ error: 'サーバーエラーが発生しました' });
            }
            res.redirect('/profile');
        });
    } catch (error) {
        console.error('予期しないエラー:', error);
        return res.status(500).json({ error: '予期しないエラーが発生しました' });
    }
});

// ================== プロフィール画像削除 (POST) ==================
app.post('/profile/delete-image', loginCheck, (req, res) => {
    try {
        const userId = req.session.user.id;

        const deleteQuery = 'UPDATE users SET profile_image = NULL WHERE id = ?';

        db.query(deleteQuery, [userId], (err, result) => {
            if (err) {
                console.error('プロフィール画像削除エラー:', err);
                return res.status(500).json({ error: 'サーバーエラーが発生しました' });
            }
            res.redirect('/profile');
        });
    } catch (error) {
        console.error('予期しないエラー:', error);
        return res.status(500).json({ error: '予期しないエラーが発生しました' });
    }
});

// ---------- フルコースページ (GET) ----------
// ここで、DBに既にフルコースがある場合はフォームに反映させる
app.get('/fullcourse', loginCheck, (req, res) => {
    const userId = req.session.user.id;

    // 既に登録があるかどうか確認
    const selectQuery = 'SELECT * FROM fullcourses WHERE user_id = ? LIMIT 1';
    db.query(selectQuery, [userId], (err, results) => {
        if (err) {
            console.error('フルコース取得エラー:', err);
            return res.status(500).send('サーバーエラーが発生しました');
        }

        let courseData = null;
        if (results.length > 0) {
            courseData = results[0];
        }

        // fullcourse.ejs に courseData を渡す
        // courseData が null なら未作成、そうでなければ既存データをフォームに反映
        res.render('fullcourse', { course: courseData });
    });
});

// ---------- フルコース登録・更新 (POST) ----------
app.post('/fullcourse', loginCheck, upload, (req, res) => {
    const userId = req.session.user.id;

    // フォームからの入力を取得
    const courseName = req.body['course-name'] || null;
    const explanation = req.body['explanation'] || null;

    const appetizerTitle = req.body['appetizer-title'] || null;
    const appetizerLink = req.body['appetizer-link'] || null;
    let appetizerImage = null;
    if (req.files['appetizer-image'] && req.files['appetizer-image'][0]) {
        appetizerImage = req.files['appetizer-image'][0].buffer;
    }
    const appetizerDescription = req.body['appetizer-description'] || null;

    const soupTitle = req.body['soup-title'] || null;
    const soupLink = req.body['soup-link'] || null;
    let soupImage = null;
    if (req.files['soup-image'] && req.files['soup-image'][0]) {
        soupImage = req.files['soup-image'][0].buffer;
    }
    const soupDescription = req.body['soup-description'] || null;

    const fishTitle = req.body['fish-title'] || null;
    const fishLink = req.body['fish-link'] || null;
    let fishImage = null;
    if (req.files['fish-image'] && req.files['fish-image'][0]) {
        fishImage = req.files['fish-image'][0].buffer;
    }
    const fishDescription = req.body['fish-description'] || null;

    const meatTitle = req.body['meat-title'] || null;
    const meatLink = req.body['meat-link'] || null;
    let meatImage = null;
    if (req.files['meat-image'] && req.files['meat-image'][0]) {
        meatImage = req.files['meat-image'][0].buffer;
    }
    const meatDescription = req.body['meat-description'] || null;

    const maindishTitle = req.body['maindish-title'] || null;
    const maindishLink = req.body['maindish-link'] || null;
    let maindishImage = null;
    if (req.files['maindish-image'] && req.files['maindish-image'][0]) {
        maindishImage = req.files['maindish-image'][0].buffer;
    }
    const maindishDescription = req.body['maindish-description'] || null;

    const saladTitle = req.body['salad-title'] || null;
    const saladLink = req.body['salad-link'] || null;
    let saladImage = null;
    if (req.files['salad-image'] && req.files['salad-image'][0]) {
        saladImage = req.files['salad-image'][0].buffer;
    }
    const saladDescription = req.body['salad-description'] || null;

    const dessertTitle = req.body['dessert-title'] || null;
    const dessertLink = req.body['dessert-link'] || null;
    let dessertImage = null;
    if (req.files['dessert-image'] && req.files['dessert-image'][0]) {
        dessertImage = req.files['dessert-image'][0].buffer;
    }
    const dessertDescription = req.body['dessert-description'] || null;

    const drinkTitle = req.body['drink-title'] || null;
    const drinkLink = req.body['drink-link'] || null;
    let drinkImage = null;
    if (req.files['drink-image'] && req.files['drink-image'][0]) {
        drinkImage = req.files['drink-image'][0].buffer;
    }
    const drinkDescription = req.body['drink-description'] || null;

    // すでに登録しているか確認
    const selectQuery = 'SELECT * FROM fullcourses WHERE user_id = ? LIMIT 1';
    db.query(selectQuery, [userId], (err, results) => {
        if (err) {
            console.error('検索エラー:', err);
            return res.status(500).send('サーバーエラーが発生しました');
        }

        // もし未登録(レコードが無い)ならINSERT
        if (results.length === 0) {
            const insertQuery = `
                INSERT INTO fullcourses (
                    user_id, course_name, explanation,
                    appetizer_title, appetizer_link, appetizer_image, appetizer_description,
                    soup_title, soup_link, soup_image, soup_description,
                    fish_title, fish_link, fish_image, fish_description,
                    meat_title, meat_link, meat_image, meat_description,
                    maindish_title, maindish_link, maindish_image, maindish_description,
                    salad_title, salad_link, salad_image, salad_description,
                    dessert_title, dessert_link, dessert_image, dessert_description,
                    drink_title, drink_link, drink_image, drink_description
                )
                VALUES (?, ?, ?,
                        ?, ?, ?, ?,
                        ?, ?, ?, ?,
                        ?, ?, ?, ?,
                        ?, ?, ?, ?,
                        ?, ?, ?, ?,
                        ?, ?, ?, ?,
                        ?, ?, ?, ?,
                        ?, ?, ?, ?)
            `;

            const insertValues = [
                userId, courseName, explanation,
                appetizerTitle, appetizerLink, appetizerImage, appetizerDescription,
                soupTitle, soupLink, soupImage, soupDescription,
                fishTitle, fishLink, fishImage, fishDescription,
                meatTitle, meatLink, meatImage, meatDescription,
                maindishTitle, maindishLink, maindishImage, maindishDescription,
                saladTitle, saladLink, saladImage, saladDescription,
                dessertTitle, dessertLink, dessertImage, dessertDescription,
                drinkTitle, drinkLink, drinkImage, drinkDescription
            ];

            db.query(insertQuery, insertValues, (err, result) => {
                if (err) {
                    console.error('フルコースINSERTエラー:', err);
                    return res.status(500).send('サーバーエラーが発生しました');
                }
                console.log('フルコースINSERT成功:', result.insertId);
                // 登録後に再度GET /fullcourseへ
                return res.redirect('/fullcourse');
            });
        } else {
            // 既にあるならUPDATE
            const updateQuery = `
                UPDATE fullcourses
                SET
                    course_name = ?,
                    explanation = ?,

                    appetizer_title = ?,
                    appetizer_link = ?,
                    appetizer_image = ?,
                    appetizer_description = ?,

                    soup_title = ?,
                    soup_link = ?,
                    soup_image = ?,
                    soup_description = ?,

                    fish_title = ?,
                    fish_link = ?,
                    fish_image = ?,
                    fish_description = ?,

                    meat_title = ?,
                    meat_link = ?,
                    meat_image = ?,
                    meat_description = ?,

                    maindish_title = ?,
                    maindish_link = ?,
                    maindish_image = ?,
                    maindish_description = ?,

                    salad_title = ?,
                    salad_link = ?,
                    salad_image = ?,
                    salad_description = ?,

                    dessert_title = ?,
                    dessert_link = ?,
                    dessert_image = ?,
                    dessert_description = ?,

                    drink_title = ?,
                    drink_link = ?,
                    drink_image = ?,
                    drink_description = ?

                WHERE user_id = ?
            `;
            const updateValues = [
                courseName,
                explanation,

                appetizerTitle,
                appetizerLink,
                appetizerImage,
                appetizerDescription,

                soupTitle,
                soupLink,
                soupImage,
                soupDescription,

                fishTitle,
                fishLink,
                fishImage,
                fishDescription,

                meatTitle,
                meatLink,
                meatImage,
                meatDescription,

                maindishTitle,
                maindishLink,
                maindishImage,
                maindishDescription,

                saladTitle,
                saladLink,
                saladImage,
                saladDescription,

                dessertTitle,
                dessertLink,
                dessertImage,
                dessertDescription,

                drinkTitle,
                drinkLink,
                drinkImage,
                drinkDescription,

                userId
            ];

            db.query(updateQuery, updateValues, (err, result) => {
                if (err) {
                    console.error('フルコースUPDATEエラー:', err);
                    return res.status(500).send('サーバーエラーが発生しました');
                }
                console.log('フルコースUPDATE成功:', result.message);
                // 更新後に再度GET /fullcourseへ
                return res.redirect('/fullcourse');
            });
        }
    });
});

// ===================== サーバー起動 =====================
app.listen(PORT, () => {
    console.log(`サーバーが :${PORT} で起動しました`);
});

// ログインしていない場合、ログイン画面に遷移させる
function loginCheck(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
}