#pragma require DataFetch

void findCommandMapping(highp float rootCMD, 
	inout highp float vertexIndex, 
	out highp float outCmdDescPtr)
{
	// traverse
	DataBlockFetchInfo db = openDataBlock(rootCMD);
	highp float addr = 0.;
	for (int i = 0; i < 16; ++i) {
		highp vec4 cmd1 = readDataBlock(db, addr);
		highp vec4 cmd2 = readDataBlock(db, addr + 1.);
		if (vertexIndex < cmd1.y) {
			if (vertexIndex < cmd1.x) {
				addr = cmd2.x;
			} else {
				addr = cmd2.y; vertexIndex -= cmd1.x;
			}
		} else {
			if (vertexIndex < cmd1.z) {
				addr = cmd2.z; vertexIndex -= cmd1.y;
			} else {
				addr = cmd2.w; vertexIndex -= cmd1.z;
			}
		}

		if (addr < 0.) {
			break;
		}
	}

	// reached leaf
	outCmdDescPtr = -1. - addr;
}
