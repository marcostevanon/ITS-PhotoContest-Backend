'use strict';

// import modules to query postgresql
const pg = require("../config/pg.config").getPool();

const resis_worker = require('../workers/redis-worker');

async function setVote(req, res) {

    pg.connect()
        .then(pg_client => pg_client.query('BEGIN;')

            // insert new vote in vote table
            .then(() => {
                const query = `INSERT INTO tsac18_stevanon.votes (id_image, id_user, value) VALUES ($1, $2, $3) RETURNING *`;
                return pg_client.query(query, [req.body.image_id, req.body.user_id, req.body.value])
            })

            // update vote number and vote average on image table
            .then((db) => {
                const query = `UPDATE tsac18_stevanon.images
                        SET avg_votes = (SELECT AVG(votes.value) FROM tsac18_stevanon.votes WHERE votes.id_image = $1),
                            n_votes   = (SELECT COUNT(votes.*)   FROM tsac18_stevanon.votes WHERE votes.id_image = $1)
                        WHERE id = $1`;
                return pg_client.query(query, [req.body.image_id])
            })
            .then(() => pg_client.query('COMMIT;'))

            // select new vote values
            .then(() => {
                const query = `SELECT n_votes as votes_n, avg_votes as votes_avg
                            FROM tsac18_stevanon.images
                            WHERE id = $1`;
                pg_client.query(query, [req.body.image_id])
                    .then(response => res.status(201).json(response.rows[0]))
                    .then(() => pg_client.release())
            })

            // regenerate redis cache
            .then(() => resis_worker.generateRatingList())
            .catch((err) => {
                console.log(err)
                pg_client.query('ROLLBACK;')

                const query = `SELECT n_votes as votes_n, avg_votes as votes_avg
                            FROM tsac18_stevanon.images
                            WHERE id = $1`;
                pg_client.query(query, [req.body.image_id])
                    .then(response => res.status(500).json(response.rows[0]))
            })
        )
        .catch(err => { console.log(err); pg_client.release(); res.sendStatus(500); });
}

async function getVotes(req, res) {
    const query = `SELECT votes.id      as vote_id,
                        votes.value     as value,
                        votes.timestamp as timestamp,
                        users.username  as author_username,
                        users.avatar    as author_avatar_url
                    FROM tsac18_stevanon.users
                        JOIN tsac18_stevanon.votes ON users.id = votes.id_user
                    WHERE votes.id_image = $1;`;

    pg.connect()
        .then(pg_client => pg_client.query(query, [req.params.postid]))
        .then(db => {
            if (db) res.status(200).json(db.rows);
            else res.sendStatus(400);
        })
        .catch(err => { console.log(err); pg_client.release(); res.sendStatus(500); });
}

module.exports = { setVote, getVotes }