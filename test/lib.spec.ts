import {
	asyncIteratorFromStream
} from '../src';

describe('stream-iterator', () => {

	it('asyncIteratorFromStream', () => {

		expect(typeof asyncIteratorFromStream).toBe('function');
	});
});
