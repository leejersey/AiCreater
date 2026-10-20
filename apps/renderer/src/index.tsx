import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {Video} from '../../../packages/video-components/src/Video';
import {parseProject} from '../../../packages/video-schema/src/validate';
import {validateVisualStyle} from '../../../packages/video-components/src/theme';

function Root() {
  return <Composition id="KnowledgeVideo" component={Video} width={1920} height={1080} fps={30} durationInFrames={150} defaultProps={{}}
    calculateMetadata={({props}) => {
      const project=props.project?parseProject(props.project):undefined;
      validateVisualStyle(project,props.visualStyle,props.visualStyleSnapshot);
      if (!project) return {durationInFrames: 150};
      return {durationInFrames: project.scenes.reduce((sum, scene) => sum + scene.duration_frames, 0), props: {...props,project}};
    }}/>;
}
registerRoot(Root);
