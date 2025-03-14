require('dotenv').config();
const express = require('express');
const session = require('express-session');
const mysql = require('mysql2');
const multer = require('multer');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY;

// EJS テンプレートエンジンの設定
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 静的ファイルの提供
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: SECRET_KEY,
  resave: false,
  saveUninitialized: false,
}));

// すべてのテンプレートで利用可能なローカル変数を設定
app.use((req, res, next) => {
  res.locals.session = req.session;
  res.locals.currentPath = req.path;
  next();
});

// Multer の設定（画像などのファイルはメモリ上に保持）
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

// MySQL 接続設定
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});
db.connect(err => {
  if (err) {
    console.error('DB接続エラー:', err);
    return;
  }
  console.log('DBに接続しました');
});

// ログインチェック用ミドルウェア
function loginCheck(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

/* ルート定義 */
// ランディングページ
app.get('/', (req, res) => {
  res.render('index');
});

// ログイン関連
app.get('/login', (req, res) => {
  res.render('login');
});
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const query = 'SELECT * FROM users WHERE username = ? AND password = ? LIMIT 1';
  db.query(query, [username, password], (err, results) => {
    if (err) {
      console.error('ログインエラー:', err);
      return res.status(500).send('サーバーエラー');
    }
    if (results.length > 0) {
      req.session.user = results[0];
      res.redirect('/home');
    } else {
      res.redirect('/login');
    }
  });
});
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// 会員登録関連
app.get('/signup', (req, res) => {
  res.render('signup');
});
app.post('/signup', (req, res) => {
  const { username, email, password, confirm_password, agree } = req.body;
  if (password !== confirm_password) {
    return res.send('パスワードが一致しません。');
  }
  if (!agree) {
    return res.send('利用規約に同意してください。');
  }
  const insertUserQuery = 'INSERT INTO users (username, email, password) VALUES (?, ?, ?)';
  db.query(insertUserQuery, [username, email, password], (err, result) => {
    if (err) {
      console.error('ユーザー登録エラー:', err);
      return res.status(500).send('サーバーエラー');
    }
    // 登録完了ページ（success.ejs）を表示
    res.render('success', { username });
  });
});



// ユーザーマイページ /home（ログイン必須）
/*
app.get('/home', loginCheck, (req, res) => {
  // DBからタイムラインデータなどを取得する場合はここで実装
  const dummyFullcourses = []; // 実際はDBから取得したデータを渡す
  res.render('home', {
    username: req.session.user.username,
    fullcourses: dummyFullcourses
  });
});*/


/*
app.get('/home', loginCheck, (req, res) => {
  // ユーザー情報とコース情報をJOINして、最新のコースを取得
  const timelineQuery = `
    SELECT courses.*, users.username, users.profile_image
    FROM courses
    JOIN users ON courses.user_id = users.id
    ORDER BY courses.created_at DESC
    LIMIT 20
  `;
  db.query(timelineQuery, (err, results) => {
    if (err) {
      console.error('タイムライン取得エラー:', err);
      return res.status(500).send('サーバーエラー');
    }
    res.render('home', {
      username: req.session.user.username,
      fullcourses: results
    });
  });
});*/



app.get('/home', loginCheck, (req, res) => {
  // ユーザー情報とコース情報をJOINして、最新のコースを取得
  const timelineQuery = `
    SELECT courses.*, users.username, users.profile_image
    FROM courses
    JOIN users ON courses.user_id = users.id
    ORDER BY courses.created_at DESC
    LIMIT 20
  `;
  db.query(timelineQuery, (err, courses) => {
    if (err) {
      console.error('タイムライン取得エラー:', err);
      return res.status(500).send('サーバーエラー');
    }
    let count = courses.length;
    if (count === 0) {
      return res.render('home', { username: req.session.user.username, fullcourses: [] });
    }
    courses.forEach(course => {
      const selectDishesQuery = 'SELECT * FROM course_dishes WHERE course_id = ?';
      db.query(selectDishesQuery, [course.id], (err, dishResults) => {
        if (err) {
          console.error('料理情報取得エラー:', err);
          course.dishes = [];
        } else {
          course.dishes = dishResults;
        }
        count--;
        if (count === 0) {
          res.render('home', {
            username: req.session.user.username,
            fullcourses: courses
          });
        }
      });
    });
  });
});








// 検索画面 GET /search （ログイン必須）
app.get('/search', loginCheck, (req, res) => {
  const q = req.query.q;
  if (!q) {
    return res.render('search', { courses: [], q: '' });
  }
  const searchTerm = '%' + q + '%';
  // courses と users を JOIN して、投稿者情報を取得し、ユーザー名も検索対象に追加
  const searchQuery = `
    SELECT courses.*, users.username, users.profile_image
    FROM courses
    JOIN users ON courses.user_id = users.id
    WHERE courses.course_name LIKE ? OR courses.explanation LIKE ? OR users.username LIKE ?
    ORDER BY courses.updated_at DESC
  `;
  db.query(searchQuery, [searchTerm, searchTerm, searchTerm], (err, courseResults) => {
    if (err) {
      console.error('検索エラー:', err);
      return res.status(500).send('サーバーエラー');
    }
    if (courseResults.length === 0) {
      return res.render('search', { courses: [], q });
    }
    let courses = courseResults;
    let count = courses.length;
    courses.forEach(course => {
      const selectDishesQuery = 'SELECT * FROM course_dishes WHERE course_id = ?';
      db.query(selectDishesQuery, [course.id], (err, dishResults) => {
        if (err) {
          console.error('料理情報取得エラー:', err);
          course.dishes = [];
        } else {
          course.dishes = dishResults;
        }
        count--;
        if (count === 0) {
          res.render('search', { courses, q });
        }
      });
    });
  });
});


app.get('/profile', loginCheck, (req, res) => {
  let profileImage = req.session.user.profile_image;
  if (profileImage) {
    // Buffer を Base64 文字列に変換し、データURL形式にする
    profileImage = `data:image/jpeg;base64,${Buffer.from(profileImage).toString('base64')}`;
  } else {
    profileImage = '/images/default-profile.png';
  }
  res.render('profile', {
    username: req.session.user.username,
    profileImage: profileImage,
    bio: req.session.user.bio || 'ここに自己紹介が表示されます'
  });
});



const profileUpload = multer({ storage: multer.memoryStorage() });


app.post('/profile/edit', loginCheck, profileUpload.single('profile_image'), (req, res) => {
  const userId = req.session.user.id;
  const bio = req.body.bio || '';
  let profileImage = null;

  // 画像がアップロードされていれば、バッファを取得
  if (req.file) {
    profileImage = req.file.buffer;
  }

  let query, params;
  if (profileImage) {
    query = 'UPDATE users SET profile_image = ?, bio = ? WHERE id = ?';
    params = [profileImage, bio, userId];
  } else {
    query = 'UPDATE users SET bio = ? WHERE id = ?';
    params = [bio, userId];
  }

  db.query(query, params, (err, result) => {
    if (err) {
      console.error('プロフィール更新エラー:', err);
      return res.status(500).send('サーバーエラー');
    }
    // セッション内のユーザー情報も更新
    req.session.user.bio = bio;
    if (profileImage) {
      req.session.user.profile_image = profileImage;
    }
    res.redirect('/profile');
  });
});


app.post('/profile/delete-image', loginCheck, (req, res) => {
  const userId = req.session.user.id;
  const query = 'UPDATE users SET profile_image = NULL WHERE id = ?';
  db.query(query, [userId], (err, result) => {
    if (err) {
      console.error('プロフィール画像削除エラー:', err);
      return res.status(500).send('サーバーエラー');
    }
    // セッション内のプロフィール画像も削除
    req.session.user.profile_image = null;
    res.redirect('/profile');
  });
});

// フルコース作成・更新ページ（/course） ※confirm.ejs を利用
app.get('/course', loginCheck, (req, res) => {
  const userId = req.session.user.id;
  const selectCourseQuery = 'SELECT * FROM courses WHERE user_id = ? LIMIT 1';
  db.query(selectCourseQuery, [userId], (err, courseResults) => {
    if (err) {
      console.error('コース取得エラー:', err);
      return res.status(500).send('サーバーエラー');
    }
    let course = null;
    let courseDishes = {};
    if (courseResults.length > 0) {
      course = courseResults[0];
      const selectDishesQuery = 'SELECT * FROM course_dishes WHERE course_id = ?';
      db.query(selectDishesQuery, [course.id], (err, dishResults) => {
        if (err) {
          console.error('料理情報取得エラー:', err);
          return res.status(500).send('サーバーエラー');
        }
        dishResults.forEach(dish => {
          courseDishes[dish.dish_code] = dish;
        });
        res.render('course', { course, courseDishes });
      });
    } else {
      res.render('course', { course, courseDishes });
    }
  });
});

app.post('/course', loginCheck, upload, (req, res) => {
  const userId = req.session.user.id;
  const courseName = req.body['course-name'] || null;
  const explanation = req.body['explanation'] || null;

  const dishTypes = [
    { code: 1, name: 'appetizer' },
    { code: 2, name: 'soup' },
    { code: 3, name: 'fish' },
    { code: 4, name: 'meat' },
    { code: 5, name: 'maindish' },
    { code: 6, name: 'salad' },
    { code: 7, name: 'dessert' },
    { code: 8, name: 'drink' }
  ];

  const selectCourseQuery = 'SELECT * FROM courses WHERE user_id = ? LIMIT 1';
  db.query(selectCourseQuery, [userId], (err, courseResults) => {
    if (err) {
      console.error('コース検索エラー:', err);
      return res.status(500).send('サーバーエラー');
    }
    if (courseResults.length === 0) {
      const insertCourseQuery = 'INSERT INTO courses (user_id, course_name, explanation) VALUES (?, ?, ?)';
      db.query(insertCourseQuery, [userId, courseName, explanation], (err, result) => {
        if (err) {
          console.error('コースINSERTエラー:', err);
          return res.status(500).send('サーバーエラー');
        }
        const courseId = result.insertId;
        upsertDishes(courseId);
      });
    } else {
      const courseId = courseResults[0].id;
      const updateCourseQuery = 'UPDATE courses SET course_name = ?, explanation = ? WHERE id = ?';
      db.query(updateCourseQuery, [courseName, explanation, courseId], (err, result) => {
        if (err) {
          console.error('コースUPDATEエラー:', err);
          return res.status(500).send('サーバーエラー');
        }
        upsertDishes(courseId);
      });
    }

    function upsertDishes(courseId) {
      dishTypes.forEach(dish => {
        const title = req.body[`${dish.name}-title`] || null;
        const link = req.body[`${dish.name}-link`] || null;
        let image = null;
        if (req.files && req.files[`${dish.name}-image`] && req.files[`${dish.name}-image`][0]) {
          image = req.files[`${dish.name}-image`][0].buffer;
        }
        const description = req.body[`${dish.name}-description`] || null;

        const selectDishQuery = 'SELECT * FROM course_dishes WHERE course_id = ? AND dish_code = ? LIMIT 1';
        db.query(selectDishQuery, [courseId, dish.code], (err, dishResults) => {
          if (err) {
            console.error(`料理(${dish.name})検索エラー:`, err);
            return;
          }
          if (dishResults.length === 0) {
            const insertDishQuery = 'INSERT INTO course_dishes (course_id, dish_code, title, link, image, description) VALUES (?, ?, ?, ?, ?, ?)';
            db.query(insertDishQuery, [courseId, dish.code, title, link, image, description], (err, result) => {
              if (err) {
                console.error(`料理(${dish.name})INSERTエラー:`, err);
              }
            });
          } else {
            const updateDishQuery = 'UPDATE course_dishes SET title = ?, link = ?, image = ?, description = ? WHERE course_id = ? AND dish_code = ?';
            db.query(updateDishQuery, [title, link, image, description, courseId, dish.code], (err, result) => {
              if (err) {
                console.error(`料理(${dish.name})UPDATEエラー:`, err);
              }
            });
          }
        });
      });
      res.redirect('/course');
    }
  });
});

// フルコース作成・更新ページ（fullcourse.ejs を利用）
// GET: 既存のコース情報を取得して表示
app.get('/fullcourse', loginCheck, (req, res) => {
  const userId = req.session.user.id;
  const selectCourseQuery = 'SELECT * FROM courses WHERE user_id = ? LIMIT 1';
  db.query(selectCourseQuery, [userId], (err, courseResults) => {
    if (err) {
      console.error('コース取得エラー:', err);
      return res.status(500).send('サーバーエラー');
    }
    if (courseResults.length > 0) {
      let course = courseResults[0];
      // fullcourse.ejs 用に各料理の項目をセット（DBの course_dishes から取得）
      const dishTypes = [
        { code: 1, name: 'appetizer' },
        { code: 2, name: 'soup' },
        { code: 3, name: 'fish' },
        { code: 4, name: 'meat' },
        { code: 5, name: 'maindish' },
        { code: 6, name: 'salad' },
        { code: 7, name: 'dessert' },
        { code: 8, name: 'drink' }
      ];
      const selectDishesQuery = 'SELECT * FROM course_dishes WHERE course_id = ?';
      db.query(selectDishesQuery, [course.id], (err, dishResults) => {
        if (err) {
          console.error('料理情報取得エラー:', err);
          return res.status(500).send('サーバーエラー');
        }
        dishResults.forEach(dish => {
          const dishType = dishTypes.find(dt => dt.code === dish.dish_code);
          if (dishType) {
            course[`${dishType.name}_title`] = dish.title;
            course[`${dishType.name}_link`] = dish.link;
            course[`${dishType.name}_image`] = dish.image;
            course[`${dishType.name}_description`] = dish.description;
          }
        });
        res.render('fullcourse', { course });
      });
    } else {
      res.render('fullcourse', { course: null });
    }
  });
});

// POST: fullcourse の作成・更新
app.post('/fullcourse', loginCheck, upload, (req, res) => {
  const userId = req.session.user.id;
  const courseName = req.body['course-name'] || null;
  const explanation = req.body['explanation'] || null;

  const dishTypes = [
    { code: 1, name: 'appetizer' },
    { code: 2, name: 'soup' },
    { code: 3, name: 'fish' },
    { code: 4, name: 'meat' },
    { code: 5, name: 'maindish' },
    { code: 6, name: 'salad' },
    { code: 7, name: 'dessert' },
    { code: 8, name: 'drink' }
  ];

  const selectCourseQuery = 'SELECT * FROM courses WHERE user_id = ? LIMIT 1';
  db.query(selectCourseQuery, [userId], (err, courseResults) => {
    if (err) {
      console.error('コース検索エラー:', err);
      return res.status(500).send('サーバーエラー');
    }
    if (courseResults.length === 0) {
      const insertCourseQuery = 'INSERT INTO courses (user_id, course_name, explanation) VALUES (?, ?, ?)';
      db.query(insertCourseQuery, [userId, courseName, explanation], (err, result) => {
        if (err) {
          console.error('コースINSERTエラー:', err);
          return res.status(500).send('サーバーエラー');
        }
        const courseId = result.insertId;
        upsertDishesFull(courseId);
      });
    } else {
      const courseId = courseResults[0].id;
      const updateCourseQuery = 'UPDATE courses SET course_name = ?, explanation = ? WHERE id = ?';
      db.query(updateCourseQuery, [courseName, explanation, courseId], (err, result) => {
        if (err) {
          console.error('コースUPDATEエラー:', err);
          return res.status(500).send('サーバーエラー');
        }
        upsertDishesFull(courseId);
      });
    }

    function upsertDishesFull(courseId) {
        dishTypes.forEach(dish => {
          const title = req.body[`${dish.name}-title`] || null;
          const link = req.body[`${dish.name}-link`] || null;
          let image = null;
          if (req.files && req.files[`${dish.name}-image`] && req.files[`${dish.name}-image`][0]) {
            image = req.files[`${dish.name}-image`][0].buffer;
          }
          const description = req.body[`${dish.name}-description`] || null;
      
          const selectDishQuery = 'SELECT * FROM course_dishes WHERE course_id = ? AND dish_code = ? LIMIT 1';
          db.query(selectDishQuery, [courseId, dish.code], (err, dishResults) => {
            if (err) {
              console.error(`料理(${dish.name})検索エラー:`, err);
              return;
            }
            if (dishResults.length === 0) {
              // 新規登録の場合
              const insertDishQuery = 'INSERT INTO course_dishes (course_id, dish_code, title, link, image, description) VALUES (?, ?, ?, ?, ?, ?)';
              db.query(insertDishQuery, [courseId, dish.code, title, link, image, description], (err, result) => {
                if (err) {
                  console.error(`料理(${dish.name})INSERTエラー:`, err);
                }
              });
            } else {
              // 更新の場合：新しい画像がアップロードされていれば image も更新、それ以外の場合は image カラムは更新しない
              if (image === null) {
                const updateDishQuery = 'UPDATE course_dishes SET title = ?, link = ?, description = ? WHERE course_id = ? AND dish_code = ?';
                db.query(updateDishQuery, [title, link, description, courseId, dish.code], (err, result) => {
                  if (err) {
                    console.error(`料理(${dish.name})UPDATEエラー:`, err);
                  }
                });
              } else {
                const updateDishQuery = 'UPDATE course_dishes SET title = ?, link = ?, image = ?, description = ? WHERE course_id = ? AND dish_code = ?';
                db.query(updateDishQuery, [title, link, image, description, courseId, dish.code], (err, result) => {
                  if (err) {
                    console.error(`料理(${dish.name})UPDATEエラー:`, err);
                  }
                });
              }
            }
          });
        });
        res.redirect('/fullcourse');
      }
      
  });
});

// 存在しないルートは404エラー
app.use((req, res) => {
  res.status(404).send('ページが見つかりません');
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`サーバーが ${PORT} で起動しました`);
});
