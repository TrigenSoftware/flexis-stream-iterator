import {
	Readable
} from 'stream';

enum State {
    Wait,
    Read,
    End,
    Error
}

export interface IStreamAsyncIteratorOptions {
	size?: number;
	map?<T>(chunk: any): T;
}

export function asyncIteratorFromStream<T>(stream: Readable|Promise<Readable>, options?: IStreamAsyncIteratorOptions) {
	return new StreamAsyncIterator<T>(stream, options);
}

export class StreamAsyncIterator<T> implements AsyncIterator<T> {

	private readonly rejects = new Set<(reason?: any) => void>();
	private streamReady: Promise<void> = null;
	private stream: Readable = null;
	private state: State = State.Wait;
	private error: Error = null;

	constructor(
		stream: Readable|Promise<Readable>,
		private readonly options: IStreamAsyncIteratorOptions = {}
	) {

		if (stream instanceof Promise) {
			this.streamReady = stream.then(this.setStream.bind(this));
		} else {
			this.setStream(stream);
		}
	}

	private setStream(stream: Readable) {
		this.stream = stream;
		stream.once('error', this.onStreamError.bind(this));
		stream.once('end', this.onStreamEnd.bind(this));
	}

	async next(): Promise<IteratorResult<T>> {

		const {
			streamReady,
			options,
			stream,
			state,
			error
		} = this;

		if (streamReady !== null) {
			await streamReady;
		}

		this.streamReady = null;

		switch (state) {

			case State.Wait: {

				const [
					readWaiter,
					cleanupReadWaiter
				] = this.until('readable', State.Read);
				const [
					endWaiter,
					cleanupEndWaiter
				] = this.until('end', State.End);

				try {
					await Promise.race([
						readWaiter,
						endWaiter
					]);
					return this.next();
				} catch (err) {
					throw err;
				} finally {
					cleanupReadWaiter();
					cleanupEndWaiter();
				}
			}

			case State.End:
				return this.getResult(null, true);

			case State.Error:
				throw error;

			case State.Read: {

				const {
					size
				} = options;
				const data = size
					? stream.read(size)
					: stream.read();

				if (data !== null) {
					return this.getResult(data);
				}

				this.state = State.Wait;
				return this.next();
			}

			default:
		}
	}

	private getResult(value: T, done = false): IteratorResult<T> {

		const {
			map
		} = this.options;

		return {
			value: typeof map !== 'function'
				? value
				: map(value),
			done
		};
	}

	private until(event: string, state: State): [Promise<void>, () => void] {

		let eventListener: () => void = null;
		const waiter = new Promise<void>((resolve, reject) => {

			eventListener = () => {
				this.state = state;
				this.rejects.delete(reject);
				eventListener = null;
				resolve();
			};

			this.stream.once(event, eventListener);
			this.rejects.add(reject);
		});
		const clean = () => {

			if (eventListener !== null) {
				this.stream.removeListener(event, eventListener);
				eventListener = null;
			}
		};

		return [waiter, clean];
	}

	private onStreamError(err: Error) {
		this.error = err;
		this.state = State.Error;
		this.rejects.forEach((reject) => {
			reject();
		});
	}

	private onStreamEnd() {
		this.state = State.End;
	}

	[Symbol.asyncIterator]() {
		return this;
	}
}
