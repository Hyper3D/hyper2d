
import { BufferBuilder } from "../utils/bufferbuilder";

const cmdMapStack = new Int32Array(128);

const enum FrameFields
{
	DescriptorAddress = 0,
	StartIndex = 1,
	EndIndex = 2,
	NumFields = 3
}

export class CommandMappingGenerator
{
	totalNumVertices: number;
	builder: BufferBuilder;
	private items: number[];

	constructor()
	{
		this.totalNumVertices = 0;
		this.builder = new BufferBuilder();
		this.items = [];
	}

	processOne(numVertices: number, cmdDescIndex: number): void
	{
		const vertexIndex = this.totalNumVertices;
		this.items.push(vertexIndex);
		this.items.push(-1 - cmdDescIndex);

		this.totalNumVertices += numVertices;
	}

	finalize(): void
	{
		const {builder, items} = this;
		const numItems = items.length >> 1;

		// preallocate the required space (conservative)
		{
			let count = 2;
			for (let i = numItems; i > 1; i = (i + 3) >> 2) {
				count += i;
			}
			builder.allocate(count * 32);
		}

		const {f32} = this.builder;
		let nextOutAddress = 8;

		const stack = cmdMapStack;
		let top = FrameFields.NumFields;
		stack[FrameFields.DescriptorAddress] = 0;
		stack[FrameFields.StartIndex] = 0;
		stack[FrameFields.EndIndex] = numItems;
		
		while (top > 0) {

			const outAddress = stack[top - FrameFields.NumFields
				+ FrameFields.DescriptorAddress];
			const index1 = stack[top - FrameFields.NumFields
				+ FrameFields.StartIndex];
			const index2 = stack[top - FrameFields.NumFields
				+ FrameFields.EndIndex];
			top -= FrameFields.NumFields;
			let mid1: number, mid2: number, mid3: number;
			if (index2 > index1 + 4) {
				mid2 = (index1 + index2) >> 1;
				mid1 = (index1 + mid2) >> 1;
				mid3 = (mid2 + index2) >> 1;
				const index1Vtx = items[index1 << 1];
				f32[outAddress] = items[mid1 << 1] - index1Vtx;
				f32[outAddress + 1] = items[mid2 << 1] - index1Vtx;
				f32[outAddress + 2] = items[mid3 << 1] - index1Vtx;
				if (mid1 === index1 + 1) {
					f32[outAddress + 4] = items[(index1 << 1) + 1];
				} else {
					f32[outAddress + 4] = nextOutAddress >> 2;
					stack[top + FrameFields.DescriptorAddress] = nextOutAddress;
					stack[top + FrameFields.StartIndex] = index1;
					stack[top + FrameFields.EndIndex] = mid1;
					top += FrameFields.NumFields;
					nextOutAddress += 8;
				}
				if (mid2 === mid1 + 1) {
					f32[outAddress + 5] = items[(mid1 << 1) + 1];
				} else {
					f32[outAddress + 5] = nextOutAddress >> 2;
					stack[top + FrameFields.DescriptorAddress] = nextOutAddress;
					stack[top + FrameFields.StartIndex] = mid1;
					stack[top + FrameFields.EndIndex] = mid2;
					top += FrameFields.NumFields;
					nextOutAddress += 8;
				}
				if (mid3 === mid2 + 1) {
					f32[outAddress + 6] = items[(mid2 << 1) + 1];
				} else {
					f32[outAddress + 6] = nextOutAddress >> 2;
					stack[top + FrameFields.DescriptorAddress] = nextOutAddress;
					stack[top + FrameFields.StartIndex] = mid2;
					stack[top + FrameFields.EndIndex] = mid3;
					top += FrameFields.NumFields;
					nextOutAddress += 8;
				}
				if (index2 === mid3 + 1) {
					f32[outAddress + 7] = items[(mid3 << 1) + 1];
				} else {
					f32[outAddress + 7] = nextOutAddress >> 2;
					stack[top + FrameFields.DescriptorAddress] = nextOutAddress;
					stack[top + FrameFields.StartIndex] = mid3;
					stack[top + FrameFields.EndIndex] = index2;
					top += FrameFields.NumFields;
					nextOutAddress += 8;
				}
			} else {
				const num = index2 - index1;
				const idx = index1 << 1;
				const index1Vtx = items[idx];
				if (num >= 2) {
					f32[outAddress] = items[idx + 2] - index1Vtx;
					if (num >= 3) {
						f32[outAddress + 1] = items[idx + 4] - index1Vtx;
						if (num >= 4) {
							f32[outAddress + 2] = items[idx + 6] - index1Vtx;
						} else {
							f32[outAddress + 2] = f32[outAddress + 1];
						}
					} else {
						f32[outAddress + 1] =
						f32[outAddress + 2] = f32[outAddress];
					}
				} else {
					f32[outAddress] = 
					f32[outAddress + 1] =
					f32[outAddress + 2] = 0;
				}

				f32[outAddress + 4] = items[idx + 1];
				if (num >= 2) {
					f32[outAddress + 5] = items[idx + 3];
					if (num >= 3) {
						f32[outAddress + 6] = items[idx + 5];
						if (num >= 4) {
							f32[outAddress + 7] = items[idx + 7];
						} else {
							f32[outAddress + 7] = items[idx + 5];
						}
					} else {
						f32[outAddress + 6] =
						f32[outAddress + 7] = items[idx + 3];
					}
				} else {
					f32[outAddress + 5] =
					f32[outAddress + 6] =
					f32[outAddress + 7] = items[idx + 1];
				}
			}
		}

		builder.size = nextOutAddress << 2;
	}

	reset(): void
	{
		this.totalNumVertices = 0;
		this.builder.reset();
		this.items.length = 0;
	}
}
