const reviewService = require('../services/review.service.js');
const {
    serializeReviewList,
    serializeReviewUpdateResponse
} = require('../serializers/review.serializer.js');

const getReviews = async(req, res) => {
    try {
        const reviews = await reviewService.getReviews(req.user);
        res.json(serializeReviewList(reviews));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const updateReview = async(req, res) => {
    try {
        const review = await reviewService.updateReview(req.params.id, req.body, req.user);
        res.json(serializeReviewUpdateResponse(review));
    } catch (error) {
        if (error.message === 'Review not found') {
            return res.status(404).json({ error: 'Review not found' });
        }
        if (error.message === 'Access denied') {
            return res.status(403).json({ error: 'Access denied' });
        }
        res.status(400).json({ error: error.message });
    }
};

module.exports = {
    getReviews,
    updateReview
};
